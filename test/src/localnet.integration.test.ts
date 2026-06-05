import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Transaction } from '@mysten/sui/transactions';
import { Transaction as Tx } from '@mysten/sui/transactions';
import { buildCreateMachine, buildFork, buildRegisterCheckpoint } from '@reeg/chain';
import { verifyFromChain } from '@reeg/verify';
import { beforeAll, describe, expect, it } from 'vitest';

// End-to-end against a real Sui node, with no Walrus or Seal and no funds beyond the localnet
// faucet. It exercises the parts unit tests cannot: real PTB execution, real Machine object
// parsing, real event reading, and the verifier replaying the actual on-chain provenance to
// the actual on-chain head. The suite skips automatically unless a localnet is reachable
// (start one with: sui start --force-regenesis --with-faucet).
const RPC = 'http://127.0.0.1:9000';
const MOVE_PATH = fileURLToPath(new URL('../../move', import.meta.url));
const MACHINE_TYPE_SUFFIX = '::machine::Machine';

const LOCALNET = await reachable(RPC);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!LOCALNET)('localnet end-to-end (chain + verify)', () => {
  let client: SuiJsonRpcClient;
  let keypair: Ed25519Keypair;
  let address: string;
  let packageId: string;

  beforeAll(async () => {
    client = new SuiJsonRpcClient({ url: RPC, network: 'localnet' });
    keypair = Ed25519Keypair.generate();
    address = keypair.getPublicKey().toSuiAddress();

    await requestSuiFromFaucetV2({ host: getFaucetHost('localnet'), recipient: address });
    await waitForGas(client, address);

    packageId = await publishPackage(client, keypair);
  }, 120_000);

  it('verifies a real run: create, two checkpoints, replay to the on-chain head', async () => {
    const machineId = await createMachine(client, keypair, packageId, address);

    await exec(
      client,
      keypair,
      buildRegisterCheckpoint({
        packageId,
        machineId,
        blobId: 111n,
        manifestHash: Uint8Array.of(1, 2, 3),
        payloadHash: Uint8Array.of(4),
      }),
    );
    await exec(
      client,
      keypair,
      buildRegisterCheckpoint({
        packageId,
        machineId,
        blobId: 222n,
        manifestHash: Uint8Array.of(5, 6, 7),
        payloadHash: Uint8Array.of(8),
      }),
    );

    await sleep(800); // let the full node index the emitted events before querying
    const report = await verifyFromChain(client, packageId, machineId);

    expect(report.ok, JSON.stringify(report.checks, null, 2)).toBe(true);
    expect(report.checks.find((c) => c.name === 'provenance-head')?.passed).toBe(true);
    expect(report.checks.find((c) => c.name === 'checkpoint-count')?.passed).toBe(true);
  }, 60_000);

  it('verifies a freshly created machine with an empty chain', async () => {
    const machineId = await createMachine(client, keypair, packageId, address);
    await sleep(500);
    const report = await verifyFromChain(client, packageId, machineId);
    // Genesis replays to itself when there are no checkpoints yet.
    expect(report.ok, JSON.stringify(report.checks, null, 2)).toBe(true);
  }, 60_000);

  it('verifies a forked child from its emitted genesis', async () => {
    const parentId = await createMachine(client, keypair, packageId, address);
    await exec(
      client,
      keypair,
      buildRegisterCheckpoint({
        packageId,
        machineId: parentId,
        blobId: 777n,
        manifestHash: Uint8Array.of(9),
        payloadHash: Uint8Array.of(9),
      }),
    );
    const childId = await forkMachine(client, keypair, packageId, parentId, address);

    await sleep(800);
    const report = await verifyFromChain(client, packageId, childId);
    expect(report.ok, JSON.stringify(report.checks, null, 2)).toBe(true);
  }, 60_000);

  it('throws when asked to verify a non-existent machine', async () => {
    const missing = `0x${'e'.repeat(64)}`;
    await expect(verifyFromChain(client, packageId, missing)).rejects.toThrow();
  });
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
    await sleep(500);
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

async function createMachine(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  policyId: string,
): Promise<string> {
  const res = await exec(client, signer, buildCreateMachine(packageId, policyId));
  return createdMachineId(res.objectChanges);
}

async function forkMachine(
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  parentMachineId: string,
  policyId: string,
): Promise<string> {
  const res = await exec(client, signer, buildFork(packageId, parentMachineId, policyId));
  return createdMachineId(res.objectChanges);
}

async function exec(client: SuiJsonRpcClient, signer: Ed25519Keypair, transaction: Transaction) {
  const res = await client.signAndExecuteTransaction({
    transaction,
    signer,
    options: { showObjectChanges: true, showEffects: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`transaction failed: ${JSON.stringify(res.effects?.status)}`);
  }
  return res;
}

function createdMachineId(
  changes: Awaited<ReturnType<SuiJsonRpcClient['signAndExecuteTransaction']>>['objectChanges'],
): string {
  const created = changes?.find(
    (c) => c.type === 'created' && c.objectType.endsWith(MACHINE_TYPE_SUFFIX),
  );
  if (created?.type !== 'created') {
    throw new Error('no Machine object was created by the transaction');
  }
  return created.objectId;
}
