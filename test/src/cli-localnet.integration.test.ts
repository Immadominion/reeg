// The chain-side CLI loop against a real Sui node: create -> verify -> fork -> grant -> revoke ->
// retire -> verify, driven through the REAL `reeg` binary (not the SDK), plus the guard rails a
// user hits (checkpoint refuses to run unencrypted; a retired environment declines checkpoints;
// restore with no checkpoint fails cleanly). No Walrus or Seal exists on localnet, so the
// checkpoint/restore data path itself is covered by `reeg selftest` and test/live/acceptance.ts on
// testnet; everything else the CLI does is covered here, free and deterministic. Skips unless a
// localnet is reachable (sui start --force-regenesis --with-faucet) and the CLI is built.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction as Tx } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RPC = 'http://127.0.0.1:9000';
const CLI = fileURLToPath(new URL('../../packages/cli/dist/index.js', import.meta.url));
const MOVE_PATH = fileURLToPath(new URL('../../move', import.meta.url));

const LOCALNET = await reachable(RPC);
const BUILT = existsSync(CLI);

describe.skipIf(!LOCALNET || !BUILT)('localnet CLI loop (the real reeg binary)', () => {
  let scratch: string;
  let keystorePath: string;
  let home: string;
  let operator: string;
  let grantee: string;
  let packageId: string;

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'reeg-cli-localnet-'));
    home = join(scratch, 'home');

    // The CLI signs from a sui keystore file; write the generated test key in the keystore's
    // format (base64 of flag byte 0 for Ed25519 followed by the 32-byte secret).
    const keypair = Ed25519Keypair.generate();
    operator = keypair.getPublicKey().toSuiAddress();
    const { secretKey } = decodeSuiPrivateKey(keypair.getSecretKey());
    keystorePath = join(scratch, 'sui.keystore');
    writeFileSync(keystorePath, JSON.stringify([toBase64(new Uint8Array([0, ...secretKey]))]), {
      mode: 0o600,
    });
    grantee = Ed25519Keypair.generate().getPublicKey().toSuiAddress();

    const client = new SuiJsonRpcClient({ url: RPC, network: 'localnet' });
    await requestSuiFromFaucetV2({ host: getFaucetHost('localnet'), recipient: operator });
    await waitForGas(client, operator);
    packageId = await publishPackage(client, keypair);
  }, 180_000);

  afterAll(() => {
    if (scratch) {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  function reeg(args: string[], extraEnv: Record<string, string> = {}): string {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        REEG_NETWORK: 'localnet',
        REEG_RPC_URL: RPC,
        REEG_PACKAGE_ID: packageId,
        REEG_HOME: home,
        REEG_OPERATOR: operator,
        SUI_KEYSTORE: keystorePath,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  function reegFails(args: string[], extraEnv: Record<string, string> = {}): string {
    try {
      reeg(args, extraEnv);
    } catch (err) {
      return ((err as { stderr?: string }).stderr ?? '').toString();
    }
    throw new Error(`expected \`reeg ${args.join(' ')}\` to fail, but it succeeded`);
  }

  it('drives create -> verify -> fork -> grant -> revoke -> retire -> verify', () => {
    const created = reeg(['create']);
    const machineId = (created.match(/Created environment (0x[0-9a-fA-F]+)/) ?? [])[1];
    expect(machineId, created).toBeTruthy();
    expect(created).toMatch(/policy: {2}0x[0-9a-fA-F]+/);

    // A fresh machine verifies (genesis replays to itself), through the CLI's verify command.
    const verified = reeg(['verify', machineId as string, '--rpc', RPC]);
    expect(verified).toContain(`Verified: ${machineId}`);

    const forked = reeg(['fork', machineId as string]);
    const childId = (forked.match(/child: {3}(0x[0-9a-fA-F]+)/) ?? [])[1];
    expect(childId, forked).toBeTruthy();
    expect(reeg(['verify', childId as string, '--rpc', RPC])).toContain(`Verified: ${childId}`);

    // Sharing controls append to the provenance chain; the loop must stay verifiable after both.
    reeg(['grant', machineId as string, grantee, '--role', 'restore']);
    reeg(['revoke', machineId as string, grantee]);

    reeg(['retire', machineId as string]);
    expect(reeg(['verify', machineId as string, '--rpc', RPC])).toContain(`Verified: ${machineId}`);

    // A retired environment declines further checkpoints, and says so plainly. (A fake key-server
    // id satisfies the encryption guard so the retired check is what actually fires; the command
    // never reaches Walrus or Seal.)
    const declined = reegFails(['checkpoint', machineId as string], {
      REEG_SEAL_KEY_SERVERS: '0x1',
    });
    expect(declined).toMatch(/retired/i);
  }, 120_000);

  it('refuses to checkpoint unencrypted when no key servers are configured', () => {
    const created = reeg(['create']);
    const machineId = (created.match(/Created environment (0x[0-9a-fA-F]+)/) ?? [])[1] as string;
    // localnet has no Seal defaults, so the encryption guard must refuse loudly, before any work.
    const refused = reegFails(['checkpoint', machineId]);
    expect(refused).toMatch(/cannot be\s+encrypted/i);
    expect(refused).toMatch(/reeg doctor/);
  }, 60_000);

  it('fails a restore cleanly when there is no checkpoint yet', () => {
    const created = reeg(['create']);
    const machineId = (created.match(/Created environment (0x[0-9a-fA-F]+)/) ?? [])[1] as string;
    const failed = reegFails(['restore', machineId, '--dest', join(scratch, 'restore-none')]);
    expect(failed).toMatch(/no checkpoint to restore yet/i);
  }, 60_000);
});

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForGas(client: SuiJsonRpcClient, owner: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const balance = await client.getBalance({ owner });
    if (BigInt(balance.totalBalance) > 0n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('faucet did not fund the address in time');
}

async function publishPackage(client: SuiJsonRpcClient, signer: Ed25519Keypair): Promise<string> {
  const built = execFileSync(
    'sui',
    ['move', 'build', '--dump-bytecode-as-base64', '--path', MOVE_PATH],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const { modules, dependencies } = JSON.parse(built) as {
    modules: string[];
    dependencies: string[];
  };

  const tx = new Tx();
  const cap = tx.publish({ modules, dependencies });
  tx.transferObjects([cap], signer.getPublicKey().toSuiAddress());

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showObjectChanges: true, showEffects: true },
  });
  await client.waitForTransaction({ digest: res.digest });

  const published = res.objectChanges?.find((c) => c.type === 'published');
  if (published?.type !== 'published') {
    throw new Error('publish did not report a package id');
  }
  return published.packageId;
}
