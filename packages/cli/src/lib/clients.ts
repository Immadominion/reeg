import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SealClient } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { WalrusClient } from '@mysten/walrus';
import { SealCrypto } from '@reeg/crypto';
import { WalrusBlobStore } from '@reeg/storage';
import type { ReegConfig } from './config';

/** Load a keypair from the local sui keystore, in memory only. The keystore is a JSON array of
 *  base64(flag || 32-byte secret); flag 0 is Ed25519. Nothing here logs the key. */
export function loadKeypair(address: string): Ed25519Keypair {
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
  throw new Error(`no Ed25519 key for ${address} in the sui keystore`);
}

export interface Clients {
  sui: SuiJsonRpcClient;
  crypto: SealCrypto;
  storage: WalrusBlobStore;
}

/** Construct the Sui, Walrus, and Seal clients from config. Walrus and Seal are only meaningful
 *  on testnet/mainnet; the network is narrowed accordingly. */
export function buildClients(config: ReegConfig): Clients {
  const sui = new SuiJsonRpcClient({ url: config.rpcUrl, network: config.network });
  const walrus = new WalrusClient({
    network: config.network as 'mainnet' | 'testnet',
    suiClient: sui,
    uploadRelay: config.walrusUploadRelay
      ? { host: config.walrusUploadRelay, sendTip: { max: 1000 } }
      : undefined,
  });
  const seal = new SealClient({
    suiClient: sui,
    serverConfigs: config.sealKeyServers.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false,
  });
  return { sui, crypto: new SealCrypto(seal), storage: new WalrusBlobStore(walrus) };
}
