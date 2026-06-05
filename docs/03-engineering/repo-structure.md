# Repository Structure

The planned layout for the Reeg monorepo. This is the target shape; it grows as the build does. The point is that anyone can guess where a thing lives. Nothing here is scaffolded yet; this is the agreed map before code.

```
reeg/
  docs/                      # this documentation suite
  move/                      # on-chain Move code
    sources/
      machine.move           # Machine object, create, fork, provenance head
      policy.move            # seal_approve access policies
    tests/                   # Move unit tests
    Move.toml
  engine/                    # Rust: snapshot/restore engine + runtime/sandbox core
    crates/
      runtime/               # sandbox wrapper, fs + exec surface
      snapshot/              # manifest, content hashing, deltas, byte-exact restore
    Cargo.toml
  packages/                  # TypeScript: chain/storage/crypto client + user surfaces
    chain/                   # Sui client: read Machine, submit PTBs (@mysten/sui)
    storage/                 # Walrus adapter: store/read blobs (@mysten/walrus)
    crypto/                  # Seal adapter: encrypt/decrypt, key-server config (@mysten/seal)
    verify/                  # independent verifier: replay provenance, confirm anchors from public Sui + Walrus only
    sdk/                     # public TypeScript SDK that ties the above together
    cli/                     # reeg CLI: create, run, checkpoint, restore, fork, verify
  apps/
    console/                 # Console web app, deployed as a Walrus Site
    indexer/                 # off-chain indexer of Machine + provenance events
  config/                    # network configs (testnet, mainnet): RPC, aggregators, key servers
  scripts/                   # deploy, publish-package, seed-demo
  test/                      # cross-package integration + end-to-end tests
```

## Language split

- `engine/` is Rust. It owns byte-exact state capture and restore and the sandbox surface, where reproducibility and low-level control decide whether verification means anything (see [tech-stack.md](tech-stack.md)).
- `packages/` and `apps/` are TypeScript, where the Sui/Walrus/Seal SDKs are first-class and the Console must run in the browser.
- The two sides meet at one artifact boundary: the engine emits and consumes a manifest (content hashes plus deltas) and content-addressed files; the TypeScript side encrypts, stores, and anchors them. The engine never imports a chain or storage client, and the client never reaches into engine internals.

## Module boundaries

- `move/` is the only on-chain code. Everything in `packages/` and `apps/` talks to it through `packages/chain`.
- `engine/crates/snapshot` knows nothing about chains or storage networks directly; it produces and consumes content-addressed artifacts, and the TypeScript client delegates encryption to `crypto`, storage to `storage`, and anchoring to `chain`. This keeps the engine unit-testable in isolation.
- `apps/console` must run as a static Walrus Site with no privileged backend. It may read from `apps/indexer`, but verification must also work reading Sui + Walrus directly, so the Console cannot depend on the indexer being trusted (see [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)).
- `apps/indexer` is rebuildable from chain events. Nothing critical may depend on its database being authoritative.
- `packages/verify` is the independent verifier and must stay dependency-light (hashing plus a Sui read), so the Console can run it in the browser. It depends on no Reeg backend and injects any blob reader rather than importing storage. Its hashing must byte-match the engine and the Move package; the cross-language contract is pinned by committed fixtures (`packages/verify/fixtures/`) and guard tests on all three sides.

## Why a monorepo

The on-chain package, the Rust engine, the TypeScript client, and the Console move together during the build window. One repo keeps the Move ABI, the engine's manifest format, the SDK, and the Console in lockstep so a change to the Machine object or the manifest surfaces everywhere at once. Cross-references to the design live in [system-architecture.md](../02-architecture/system-architecture.md).

## Naming

- Lowercase, hyphenless package directories.
- Public SDK entry points named for the verb the user runs (`create`, `checkpoint`, `restore`, `fork`, `verify`), matching the CLI and the use cases in [personas-and-use-cases.md](../01-product/personas-and-use-cases.md).
</content>
