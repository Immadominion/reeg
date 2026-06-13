export type EnokiNetwork = 'mainnet' | 'testnet' | 'devnet';

// The Reeg Move calls a sponsored agent transaction may invoke. This caps sponsorship to Reeg
// operations — defense in depth alongside the Enoki Portal's own allowlist on the private key.
// seal_approve* are deliberately absent: they are dry-run-only (never executed), so never sponsored.
// Override the whole set with REEG_SPONSORED_TARGETS (comma-separated module::function suffixes).
const DEFAULT_TARGET_SUFFIXES = [
  'machine::create_owned',
  'machine::fork_owned',
  'machine::retire',
  'machine::register_checkpoint',
  'access::create_shared_machine',
  'access::grant',
  'access::revoke',
];

export interface ApiConfig {
  port: number;
  network: EnokiNetwork;
  /** The Enoki PRIVATE key (server-side only). May be '' so the server still boots for health
   *  checks before the secret is wired; sponsorship endpoints then return 503 until it is set. */
  enokiSecretKey: string;
  /** The Reeg Move package id the sponsored targets are built from. May be ''. */
  packageId: string;
  /** Fully-qualified `pkg::module::function` targets Enoki is permitted to sponsor. */
  sponsoredTargets: string[];
  /** CORS origins allowed to call the paymaster (the Console). */
  allowedOrigins: string[];
}

export function asEnokiNetwork(value: string): EnokiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet') {
    return value;
  }
  throw new Error(
    `unsupported ENOKI_NETWORK "${value}" (Enoki supports mainnet, testnet, devnet — not localnet)`,
  );
}

export function loadApiConfig(): ApiConfig {
  const network = asEnokiNetwork(process.env.ENOKI_NETWORK ?? 'testnet');
  const packageId = process.env.REEG_PACKAGE_ID ?? '';
  const suffixes =
    process.env.REEG_SPONSORED_TARGETS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? DEFAULT_TARGET_SUFFIXES;
  const allowedOrigins = (
    process.env.REEG_ALLOWED_ORIGINS ?? 'http://localhost:5173,https://app.reeg.xyz'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port: Number(process.env.PORT ?? '8787'),
    network,
    enokiSecretKey: process.env.ENOKI_SECRET_KEY ?? '',
    packageId,
    // Built only when a package id is set, so a sponsored call without one fails loudly rather
    // than sponsoring an unconstrained target set.
    sponsoredTargets: packageId ? suffixes.map((s) => `${packageId}::${s}`) : [],
    allowedOrigins,
  };
}
