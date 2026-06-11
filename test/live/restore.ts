// Live restore: read a Machine's latest checkpoint from Walrus and decrypt it with Seal, proving
// the recover-your-environment path end to end. Decryption is the only step that calls the key
// server (fetch_key) — so this is where a provider API key (e.g. Ruby Nodes) is exercised.
//
// Run: REEG_NETWORK=mainnet REEG_OPERATOR=<addr> REEG_MACHINE_ID=<id> pnpm --filter @reeg/test exec tsx live/restore.ts
// Reads the operator key from the local sui keystore (in memory, never printed).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SealClient } from '@mysten/seal';
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { WalrusClient } from '@mysten/walrus';
import { SealCrypto } from '@reeg/crypto';
import { restore } from '@reeg/sdk';
import { WalrusBlobStore } from '@reeg/storage';

type Network = 'mainnet' | 'testnet';
const NETWORK: Network = process.env.REEG_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const OPERATOR = process.env.REEG_OPERATOR;
const MACHINE_ID = process.env.REEG_MACHINE_ID;

interface NetConfig {
  seal: {
    keyServerObjectIds: string[];
    threshold: number;
    apiKeyName?: string;
    apiKeyEnv?: string;
  };
  reeg: { packageId: string };
}

function loadConfig(): NetConfig {
  const path = fileURLToPath(new URL(`../../config/${NETWORK}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadKeypair(address: string): Ed25519Keypair {
  const path = process.env.SUI_KEYSTORE ?? join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as string[];
  for (const entry of entries) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0) continue;
    const keypair = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (keypair.getPublicKey().toSuiAddress() === address) return keypair;
  }
  throw new Error(`no Ed25519 key for ${address} found in the keystore`);
}

async function main() {
  if (!OPERATOR || !MACHINE_ID) {
    throw new Error('set REEG_OPERATOR and REEG_MACHINE_ID');
  }
  const config = loadConfig();
  const signer = loadKeypair(OPERATOR);
  const sui = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const walrus = new WalrusClient({ network: NETWORK, suiClient: sui });
  const apiKey = config.seal.apiKeyEnv ? process.env[config.seal.apiKeyEnv] : undefined;
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: config.seal.keyServerObjectIds.map((objectId) => ({
      objectId,
      weight: 1,
      ...(config.seal.apiKeyName && apiKey ? { apiKeyName: config.seal.apiKeyName, apiKey } : {}),
    })),
    verifyKeyServers: false,
  });

  console.log(`restoring ${MACHINE_ID} on ${NETWORK} (decrypt via Seal key server)…`);
  const plaintext = await restore(
    { machineId: MACHINE_ID, packageId: config.reeg.packageId },
    { sui, storage: new WalrusBlobStore(walrus), crypto: new SealCrypto(seal), signer },
  );
  console.log(`RESTORE OK: decrypted ${plaintext.length} bytes`);
  console.log(`  preview: ${new TextDecoder().decode(plaintext.slice(0, 80))}`);
}

main().catch((err) => {
  console.error('RESTORE FAILED');
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exitCode = 1;
});
