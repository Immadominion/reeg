import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { originalPackageId as resolveOriginal } from '@reeg/chain';

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export interface ReegConfig {
  network: SuiNetwork;
  rpcUrl: string;
  packageId: string;
  /** The package's ORIGINAL (first-published) id; equal to packageId for a never-upgraded
   *  package. Two things require it while on-chain moveCalls use the latest {@link packageId}:
   *  Seal (which namespaces the encryption identity and SessionKey by the first version and
   *  rejects an upgraded id), and machine/access event-type queries (Move events are tagged with
   *  the DEFINING package id, so an upgraded id silently finds nothing). */
  originalPackageId: string;
  sealKeyServers: string[];
  sealThreshold: number;
  walrusUploadRelay: string;
  operator: string;
  engineBin: string;
}

// Verified per-network defaults (mirror config/testnet.json and config/mainnet.json) so `reeg`
// works with just a package id and operator. The mainnet entry matters for safety: without it,
// a mainnet checkpoint would resolve to an EMPTY key-server list and could upload an unencrypted
// snapshot. Everything here is overridable by flag or env.
const NETWORK_DEFAULTS: Record<SuiNetwork, { sealKeyServers: string[]; uploadRelay: string }> = {
  testnet: {
    sealKeyServers: ['0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75'],
    uploadRelay: 'https://upload-relay.testnet.walrus.space',
  },
  mainnet: {
    sealKeyServers: ['0xeed10312e11fa95686cc7e304f004513bd31cf1ab3c39ab206c9e73f36d191d9'],
    uploadRelay: 'https://upload-relay.mainnet.walrus.space',
  },
  devnet: { sealKeyServers: [], uploadRelay: '' },
  localnet: { sealKeyServers: [], uploadRelay: '' },
};

export interface CommonOptions {
  network?: string;
  rpc?: string;
  package?: string;
  operator?: string;
}

/** Resolve configuration from flags, then env, then verified per-network defaults. Does NOT throw
 *  on a missing package id, so read-only tools like `reeg doctor` can report what's missing rather
 *  than crash. Use {@link loadConfig} for commands that require a package id. */
export function resolveConfig(options: CommonOptions): ReegConfig {
  const network = asNetwork(options.network ?? process.env.REEG_NETWORK ?? 'testnet');
  const defaults = NETWORK_DEFAULTS[network];
  const envServers = process.env.REEG_SEAL_KEY_SERVERS?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const packageId = options.package ?? process.env.REEG_PACKAGE_ID ?? '';
  return {
    network,
    rpcUrl: options.rpc ?? process.env.REEG_RPC_URL ?? getJsonRpcFullnodeUrl(network),
    packageId,
    originalPackageId: process.env.REEG_ORIGINAL_PACKAGE_ID ?? resolveOriginal(packageId),
    sealKeyServers: envServers ?? defaults.sealKeyServers,
    sealThreshold: Number(process.env.REEG_SEAL_THRESHOLD ?? '1'),
    walrusUploadRelay: process.env.REEG_WALRUS_UPLOAD_RELAY ?? defaults.uploadRelay,
    operator: options.operator ?? process.env.REEG_OPERATOR ?? '',
    engineBin: process.env.REEG_ENGINE ?? 'reeg-engine',
  };
}

/** Resolve configuration, requiring a package id (every chain-touching command needs one). */
export function loadConfig(options: CommonOptions): ReegConfig {
  const config = resolveConfig(options);
  if (!config.packageId) {
    throw new Error('a package id is required (--package or REEG_PACKAGE_ID)');
  }
  return config;
}

/** The operator address, required for any command that signs. */
export function requireOperator(config: ReegConfig): string {
  if (!config.operator) {
    throw new Error('an operator address is required (--operator or REEG_OPERATOR)');
  }
  return config.operator;
}

/** Guard a checkpoint: the snapshot is Seal-encrypted client-side BEFORE it ever touches Walrus, so
 *  a run with no key servers configured would upload plaintext. Refuse loudly rather than silently
 *  weaken the encryption guarantee. (On mainnet, the *decrypt* on restore additionally needs the
 *  provider key-server API key; that is a separate, documented constraint.) */
export function requireEncryptionConfig(config: ReegConfig): void {
  if (config.sealKeyServers.length === 0) {
    throw new Error(
      `no Seal key servers are configured for ${config.network}, so a checkpoint cannot be ` +
        'encrypted. Set REEG_SEAL_KEY_SERVERS=<objectId,...> (testnet and mainnet have defaults). ' +
        'Run `reeg doctor` to check your setup. Refusing to checkpoint unencrypted.',
    );
  }
}

export function asNetwork(value: string): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  throw new Error(`unknown network "${value}" (expected mainnet, testnet, devnet, or localnet)`);
}
