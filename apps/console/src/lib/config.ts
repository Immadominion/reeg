import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

function asNetwork(value: string | undefined): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  return 'testnet';
}

/**
 * Console configuration, from Vite env so testnet, mainnet, and localnet differ only by build
 * config (no hardcoded endpoints). The Console reads Sui directly; verification needs no wallet
 * and no Reeg backend.
 */
export const CONFIG = {
  network: asNetwork(import.meta.env.VITE_REEG_NETWORK),
  packageId: import.meta.env.VITE_REEG_PACKAGE_ID ?? '',
};

/** A read-only Sui client for reads and verification, independent of any connected wallet. */
export const readClient = new SuiJsonRpcClient({
  url: import.meta.env.VITE_REEG_RPC_URL ?? getJsonRpcFullnodeUrl(CONFIG.network),
  network: CONFIG.network,
});

export function hasPackageConfigured(): boolean {
  return CONFIG.packageId.length > 0;
}
