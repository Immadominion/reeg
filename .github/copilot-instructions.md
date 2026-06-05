# Copilot instructions for Reeg

Reeg makes each AI-agent environment (a "Machine") an object you own on Sui, backed by
content-addressed data on Walrus, encrypted client-side with Seal, so a run can be shared,
forked, moved across hosts, and verified with Reeg offline. **Read
[docs/ai/AGENTS.md](../docs/ai/AGENTS.md) first; it is the source of truth and this file is a
short operational companion.** Full docs index: [docs/README.md](../docs/README.md).

## Architecture (read these to orient)
- Monorepo, one language per layer: `move/` (on-chain, Move 2024), `engine/` (Rust:
  snapshot/restore + sandbox runtime), `packages/` and `apps/` (TypeScript). Map:
  [repo-structure.md](../docs/03-engineering/repo-structure.md); design:
  [system-architecture.md](../docs/02-architecture/system-architecture.md).
- One artifact boundary: the Rust engine emits/consumes a manifest + content-addressed
  files; the TS client encrypts (`packages/crypto`), stores (`packages/storage`), and
  anchors (`packages/chain`). The engine never imports a chain/storage client; the client
  never reaches into engine internals.
- Dependency direction: code reaches `move/` only through `packages/chain`; `packages/sdk`
  composes chain+storage+crypto; `packages/cli` wraps the SDK.
- Hard invariant (NFR-1): verifying a past run must never require a live or honest Reeg
  service. `apps/indexer` is display-only and rebuildable; `apps/console` is a static Walrus
  Site; verification reads only Sui + Walrus. See
  [security-and-threat-model.md](../docs/02-architecture/security-and-threat-model.md).

## Workflows (verified commands)
- TS: `pnpm install`; `pnpm build` / `test` / `typecheck` run via Turborepo; `pnpm lint` and
  `pnpm format` run Biome. Node >= 24, pnpm 10 (see `package.json`, `.node-version`).
- Rust engine: `cargo build|test --manifest-path engine/Cargo.toml --workspace` (toolchain
  pinned in `rust-toolchain.toml`).
- Move: `sui move build --path move`; `sui move test --path move`.

## Conventions specific to this repo
- TS packages are `@reeg/<name>`; internal deps use `workspace:*`; libs build with tsup
  (ESM + dts); tests use Vitest; each `tsconfig.json` extends `tsconfig.base.json`.
- `tsconfig.base.json` sets `ignoreDeprecations: "6.0"` because TypeScript 6 errors on
  `baseUrl`, which tsup's dts step sets internally.
- `@mysten/sui` v2 renamed APIs: import `getJsonRpcFullnodeUrl` / `SuiJsonRpcClient` from
  `@mysten/sui/jsonRpc` (not `getFullnodeUrl` / `SuiClient`). Example:
  `apps/console/src/main.tsx`.
- Networks are config, not code: `config/testnet.json`, `config/mainnet.json`, plus `.env`
  (see `.env.example`). Never hardcode RPC / aggregator / key-server endpoints; testnet and
  mainnet differ only by config.
- `seal_approve` policies (`move/sources/policy.move`) are security-critical: name starts
  with `seal_approve`, first param `id: vector<u8>`, non-public `entry`, abort to deny,
  side-effect free.
- Pinned platform versions are listed in
  [sui-tech-reference.md](../docs/02-architecture/sui-tech-reference.md) section 0; the repo
  currently pins `@mysten/sui` ^2.17, `@mysten/walrus` ^1.1, `@mysten/seal` ^1.1.

## Working rules
- Voice for any text/code (AGENTS.md section 10): no em dashes; lead with the point; link
  files as markdown links, not inline-code filenames; comment the why, not the what; do not
  add comments to code you did not change.
- [Unverified] Before adding or upgrading a dependency, re-check that the version is current
  and not deprecated against the registry/web; do not rely on these instructions for "latest"
  numbers. The version pins above are what the repo currently declares, not a guarantee they
  are still newest.
- UI work: the design system lives in [brand.md](../brand.md) (tokens, voice, the Verified
  badge) realized as Tailwind v4 semantic tokens in `apps/console/src/index.css` and primitives
  in `apps/console/src/components/ui/`. Reuse those tokens and primitives (never raw hex), and
  follow [design-brief.md](../docs/06-design/design-brief.md): hide blockchain language,
  Vercel/Linear/GitHub calm, and design the empty/loading/error/success states. Console is a
  static Walrus Site that reads Sui directly and verifies via `@reeg/verify` with no backend.
- On conflicts, source of truth is AGENTS.md, then sui-tech-reference.md for platform facts.
  Scope and status: [build-roadmap.md](../docs/03-engineering/build-roadmap.md).
