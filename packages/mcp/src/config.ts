import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

// Verified testnet defaults (matching @reeg/cli) so the server works out of the box on testnet with
// just a package id and operator. Everything is overridable by env or per-call argument.
const TESTNET_SEAL_KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
];
const TESTNET_UPLOAD_RELAY = 'https://upload-relay.testnet.walrus.space';

export interface ServerConfig {
  network: SuiNetwork;
  rpcUrl: string;
  /** The Reeg Move package id; empty until set. Read tools that need it call requirePackage. */
  packageId: string;
  sealKeyServers: string[];
  sealThreshold: number;
  walrusUploadRelay: string;
  /** The address whose local-keystore key signs write transactions; empty until set. */
  operator: string;
  engineBin: string;
}

/** Per-call overrides an agent may pass on a tool, layered over the server's env config. */
export interface ConfigOverrides {
  network?: string;
  rpc?: string;
  package?: string;
  operator?: string;
}

export function asNetwork(value: string): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  throw new Error(`unknown network "${value}" (expected mainnet, testnet, devnet, or localnet)`);
}

/**
 * Resolve configuration from per-call overrides, then env, then verified testnet defaults. Unlike
 * the CLI's loadConfig, this never throws on a missing package id or operator: a read tool may not
 * need them, so the requirePackage / requireOperator guards below enforce them per tool instead.
 */
export function resolveConfig(overrides: ConfigOverrides = {}): ServerConfig {
  const network = asNetwork(overrides.network ?? process.env.REEG_NETWORK ?? 'testnet');
  const envServers = process.env.REEG_SEAL_KEY_SERVERS?.split(',').filter(Boolean);
  return {
    network,
    rpcUrl: overrides.rpc ?? process.env.REEG_RPC_URL ?? getJsonRpcFullnodeUrl(network),
    packageId: overrides.package ?? process.env.REEG_PACKAGE_ID ?? '',
    sealKeyServers: envServers ?? (network === 'testnet' ? TESTNET_SEAL_KEY_SERVERS : []),
    sealThreshold: Number(process.env.REEG_SEAL_THRESHOLD ?? '1'),
    walrusUploadRelay:
      process.env.REEG_WALRUS_UPLOAD_RELAY ?? (network === 'testnet' ? TESTNET_UPLOAD_RELAY : ''),
    operator: overrides.operator ?? process.env.REEG_OPERATOR ?? '',
    engineBin: process.env.REEG_ENGINE ?? 'reeg-engine',
  };
}

export function requirePackage(config: ServerConfig): string {
  if (!config.packageId) {
    throw new Error('a package id is required (set REEG_PACKAGE_ID or pass "package")');
  }
  return config.packageId;
}

export function requireOperator(config: ServerConfig): string {
  if (!config.operator) {
    throw new Error(
      'a signing address is required for this write tool (set REEG_OPERATOR or pass "operator")',
    );
  }
  return config.operator;
}
