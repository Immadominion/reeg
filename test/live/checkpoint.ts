// Live testnet checkpoint: the real Phase E loop end to end. It creates a Machine, then runs
// @reeg/sdk checkpoint() to Seal-encrypt a bundle, store the ciphertext on Walrus, and anchor
// the blob id + manifest hash on Sui in one transaction, then verifies the result from public
// data with no Reeg backend. It signs with the local sui keystore key, loaded in memory and
// never printed.
//
// Run: pnpm --filter @reeg/test run live:checkpoint
// Spends a little testnet SUI (gas) and WAL (storage). Operator address via REEG_OPERATOR.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SealClient } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { WalrusClient } from '@mysten/walrus';
import { buildCreateMachine, readMachine } from '@reeg/chain';
import { SealCrypto } from '@reeg/crypto';
import { checkpoint } from '@reeg/sdk';
import { WalrusBlobStore } from '@reeg/storage';
import { blake3Hash, bytesEqual, verifyFromChain } from '@reeg/verify';

interface TestnetConfig {
  walrus: { uploadRelayHost: string };
  seal: { keyServerObjectIds: string[]; threshold: number };
  reeg: { packageId: string };
}

const OPERATOR = process.env.REEG_OPERATOR;

function loadConfig(): TestnetConfig {
  const path = fileURLToPath(new URL('../../config/testnet.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Load the operator's keypair from the local sui keystore, in memory only. The keystore is a
// JSON array of base64(flag || 32-byte secret); flag 0 is Ed25519. Nothing here logs the key.
function loadKeypair(address: string): Ed25519Keypair {
  const path = process.env.SUI_KEYSTORE ?? join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as string[];
  for (const entry of entries) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0) {
      continue;
    }
    const keypair = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (keypair.getPublicKey().toSuiAddress() === address) {
      return keypair;
    }
  }
  throw new Error(`no Ed25519 key for ${address} found in the keystore`);
}

async function createMachine(
  sui: SuiJsonRpcClient,
  signer: Ed25519Keypair,
  packageId: string,
): Promise<string> {
  const tx = buildCreateMachine(packageId, packageId);
  const res = await sui.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showObjectChanges: true, showEffects: true },
  });
  await sui.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`create failed: ${JSON.stringify(res.effects?.status)}`);
  }
  const created = res.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType.endsWith('::machine::Machine'),
  );
  if (created?.type !== 'created') {
    throw new Error('create did not produce a Machine object');
  }
  return created.objectId;
}

async function main() {
  const config = loadConfig();
  const packageId = config.reeg.packageId;
  if (!packageId || packageId === '0x0') {
    throw new Error('config/testnet.json has no published packageId');
  }
  if (!OPERATOR) {
    throw new Error('set REEG_OPERATOR to a funded testnet address that holds SUI + WAL');
  }

  const keypair = loadKeypair(OPERATOR);
  const sui = new SuiJsonRpcClient({
    url: 'https://fullnode.testnet.sui.io:443',
    network: 'testnet',
  });
  // Write through the testnet upload relay: fanning out slivers to every storage node from a
  // single client is unreliable, so the relay does it. The tip (a few MIST) is auto-paid.
  const walrus = new WalrusClient({
    network: 'testnet',
    suiClient: sui,
    uploadRelay: { host: config.walrus.uploadRelayHost, sendTip: { max: 1000 } },
  });
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: config.seal.keyServerObjectIds.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });

  console.log(`operator: ${OPERATOR}`);
  console.log(`package:  ${packageId}`);

  console.log('\n1. creating a Machine on testnet…');
  const machineId = await createMachine(sui, keypair, packageId);
  console.log(`   machine: ${machineId}`);

  console.log('\n2. checkpoint: Seal-encrypt -> Walrus store -> anchor on Sui…');
  const data = new TextEncoder().encode(
    JSON.stringify({ note: 'reeg live checkpoint', kind: 'demo-bundle' }),
  );
  const manifestHash = blake3Hash(data);
  const result = await checkpoint(
    { data, manifestHash },
    { machineId, packageId, threshold: config.seal.threshold, epochs: 1 },
    {
      crypto: new SealCrypto(seal),
      storage: new WalrusBlobStore(walrus),
      sui,
      signer: keypair,
    },
  );
  console.log(`   walrus blobId: ${result.blobId}`);
  console.log(`   blobId (u256): ${result.blobIdU256}`);
  console.log(`   anchor tx:     ${result.digest}`);
  console.log(`   backup key:    produced (${result.backupKey.length} bytes, not printed)`);

  console.log('\n3. confirming the on-chain Machine advanced…');
  await sui.waitForTransaction({ digest: result.digest });
  const machine = await retry('readMachine', () => readMachine(sui, machineId));
  assert(machine.currentBlobId === result.blobIdU256, 'currentBlobId pinned the new blob');
  assert(machine.checkpointCount === 1n, 'checkpoint count advanced to 1');
  console.log(`   currentBlobId matches, checkpointCount = ${machine.checkpointCount}`);

  console.log('\n4. confirming the stored blob is ciphertext (not the plaintext)…');
  const stored = await retry('readBlob', () =>
    new WalrusBlobStore(walrus).readByU256(result.blobIdU256),
  );
  assert(!bytesEqual(stored, data), 'stored blob differs from plaintext (it is encrypted)');
  console.log(`   stored ${stored.length} bytes of ciphertext (plaintext was ${data.length})`);

  console.log('\n5. verifying from public data, with the Reeg backend offline…');
  const report = await retry('verify', () => verifyFromChain(sui, packageId, machineId));
  for (const check of report.checks) {
    console.log(`   ${check.passed ? 'ok  ' : 'FAIL'} ${check.name}`);
  }
  assert(report.ok, 'independent verification passed');

  console.log('\nLIVE CHECKPOINT OK');
  console.log(`open in the Console: #/env/${machineId}`);
}

// The public testnet RPC occasionally resets a connection; reads are idempotent, so retry.
async function retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.log(`   (${label} attempt ${attempt} hit a transient error, retrying)`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
  console.log(`   ✓ ${message}`);
}

main().catch((err) => {
  console.error('\nLIVE CHECKPOINT FAILED');
  console.error(err);
  process.exitCode = 1;
});
