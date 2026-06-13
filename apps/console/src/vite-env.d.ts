/// <reference types="vite/client" />

// Typed Console build config (Vite injects these at build time; see lib/config.ts and lib/enoki.tsx).
interface ImportMetaEnv {
  readonly VITE_REEG_NETWORK?: string;
  readonly VITE_REEG_PACKAGE_ID?: string;
  readonly VITE_REEG_RPC_URL?: string;
  readonly VITE_REEG_PREVIEW?: string;
  /** Enoki PUBLIC API key (enoki_public_…) — drives "Sign in with Reeg" zkLogin in the browser. */
  readonly VITE_ENOKI_API_KEY?: string;
  /** Google OAuth Web client id for the zkLogin provider. */
  readonly VITE_ENOKI_GOOGLE_CLIENT_ID?: string;
  /** Reeg paymaster base URL (apps/api). When set, on-chain actions are gas-sponsored. */
  readonly VITE_REEG_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// @fontsource packages are CSS-only (no JS/types); declare them for side-effect imports.
declare module '@fontsource-variable/montserrat';
declare module '@fontsource-variable/jetbrains-mono';
