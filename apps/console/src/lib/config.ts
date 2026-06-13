import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

function asNetwork(value: string | undefined): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  return 'testnet';
}

/** Published Reeg package per network (config/<network>.json), baked in so the Console works out
 *  of the box. A build can still override with VITE_REEG_PACKAGE_ID. */
const PUBLISHED_PACKAGE: Partial<Record<SuiNetwork, string>> = {
  mainnet: '0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e',
  testnet: '0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2',
};

const network = asNetwork(import.meta.env.VITE_REEG_NETWORK);
const packageId = import.meta.env.VITE_REEG_PACKAGE_ID || PUBLISHED_PACKAGE[network] || '';

/**
 * Console configuration, from Vite env so networks differ only by build config (no hardcoded
 * endpoints in components). The Console reads Sui directly; verification needs no wallet and no
 * Reeg backend.
 */
export const CONFIG = { network, packageId };

/** Convenience named exports used across the UI. */
export const NETWORK: SuiNetwork = network;
export const PACKAGE_ID: string = packageId;

/**
 * The Reeg paymaster base URL (apps/api). When set, the Console routes its on-chain Reeg actions
 * through it so gas is sponsored — a zkLogin user with no SUI can act for free. Empty = the
 * connected wallet pays its own gas (the unsponsored path). Verification never goes through here.
 */
export const API_URL: string = (import.meta.env.VITE_REEG_API_URL ?? '').replace(/\/$/, '');

export function sponsorshipConfigured(): boolean {
  return API_URL.length > 0;
}

/** A read-only Sui client for reads and verification, independent of any connected wallet. */
export const readClient = new SuiJsonRpcClient({
  url: import.meta.env.VITE_REEG_RPC_URL ?? getJsonRpcFullnodeUrl(network),
  network,
});

export function hasPackageConfigured(): boolean {
  return CONFIG.packageId.length > 0;
}

/** A link to the public Sui explorer for an object or transaction, used for "view on chain"
 *  affordances. Read-only and verifier-independent. */
export function explorerUrl(kind: 'object' | 'tx', id: string): string {
  return `https://suiscan.xyz/${network}/${kind}/${id}`;
}
