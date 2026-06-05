import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export interface ReegConfig {
  network: SuiNetwork;
  rpcUrl: string;
  packageId: string;
  sealKeyServers: string[];
  sealThreshold: number;
  walrusUploadRelay: string;
  operator: string;
  engineBin: string;
}

// Verified testnet defaults (see config/testnet.json) so `reeg` works out of the box on testnet
// with just a package id and operator. Everything is overridable by flag or env.
const TESTNET_SEAL_KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
];
const TESTNET_UPLOAD_RELAY = 'https://upload-relay.testnet.walrus.space';

export interface CommonOptions {
  network?: string;
  rpc?: string;
  package?: string;
  operator?: string;
}

/** Resolve configuration from flags, then env, then verified testnet defaults. */
export function loadConfig(options: CommonOptions): ReegConfig {
  const network = asNetwork(options.network ?? process.env.REEG_NETWORK ?? 'testnet');
  const packageId = options.package ?? process.env.REEG_PACKAGE_ID ?? '';
  if (!packageId) {
    throw new Error('a package id is required (--package or REEG_PACKAGE_ID)');
  }
  const envServers = process.env.REEG_SEAL_KEY_SERVERS?.split(',').filter(Boolean);
  return {
    network,
    rpcUrl: options.rpc ?? process.env.REEG_RPC_URL ?? getJsonRpcFullnodeUrl(network),
    packageId,
    sealKeyServers: envServers ?? (network === 'testnet' ? TESTNET_SEAL_KEY_SERVERS : []),
    sealThreshold: Number(process.env.REEG_SEAL_THRESHOLD ?? '1'),
    walrusUploadRelay:
      process.env.REEG_WALRUS_UPLOAD_RELAY ?? (network === 'testnet' ? TESTNET_UPLOAD_RELAY : ''),
    operator: options.operator ?? process.env.REEG_OPERATOR ?? '',
    engineBin: process.env.REEG_ENGINE ?? 'reeg-engine',
  };
}

/** The operator address, required for any command that signs. */
export function requireOperator(config: ReegConfig): string {
  if (!config.operator) {
    throw new Error('an operator address is required (--operator or REEG_OPERATOR)');
  }
  return config.operator;
}

export function asNetwork(value: string): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  throw new Error(`unknown network "${value}" (expected mainnet, testnet, devnet, or localnet)`);
}
