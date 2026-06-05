# Reeg

The computer your AI agents live in: a sandbox you own. Own it, share it, move it, prove it.

Reeg makes each agent environment a Machine you own on Sui, backed by content-addressed
data on Walrus, encrypted client-side with Seal, so a run can be shared, forked, moved
across hosts, and independently verified with the Reeg backend offline. The product,
vision, architecture, and build plan live in [docs/](docs/README.md). Start there.

## Layout

This is a monorepo. The shape matches [docs/03-engineering/repo-structure.md](docs/03-engineering/repo-structure.md).

| Path | What | Language |
| --- | --- | --- |
| [move/](move/) | on-chain Machine object, provenance, seal_approve policy | Move 2024 |
| [engine/](engine/) | snapshot/restore engine + runtime/sandbox core | Rust |
| [packages/chain/](packages/chain/) | Sui client: read Machine, submit PTBs | TypeScript |
| [packages/storage/](packages/storage/) | Walrus adapter: store/read blobs | TypeScript |
| [packages/crypto/](packages/crypto/) | Seal adapter: client-side encrypt/decrypt | TypeScript |
| [packages/sdk/](packages/sdk/) | public SDK tying the adapters together | TypeScript |
| [packages/cli/](packages/cli/) | `reeg` CLI | TypeScript |
| [apps/console/](apps/console/) | Console, deployed as a static Walrus Site | TypeScript / React |
| [apps/indexer/](apps/indexer/) | display-only indexer, rebuildable from chain events | TypeScript |
| [config/](config/) | per-network config (testnet, mainnet) | JSON |
| [scripts/](scripts/) | deploy, publish-package, seed-demo | mixed |
| [test/](test/) | cross-package integration and end-to-end tests | TypeScript |

The Rust engine and the TypeScript client meet at one artifact boundary: a manifest plus
content-addressed files. The engine never imports a chain or storage client; the client
never reaches into engine internals.

## Toolchain

Pinned and config-driven, not hardcoded. See [.node-version](.node-version),
[rust-toolchain.toml](rust-toolchain.toml), and per-package manifests.

- Node >= 24, pnpm 10 (workspaces), Turborepo for task running, Biome for lint/format.
- Rust 1.95 (stable), Cargo workspace.
- Sui CLI + Walrus CLI for on-chain and storage operations.
- TypeScript 6, Vite 8 + React 19 (Console), Vitest for tests.

Platform SDKs are pinned to current releases: `@mysten/sui` ^2.17, `@mysten/walrus` ^1.1,
`@mysten/seal` ^1.1. Verify status before mainnet against
[docs/02-architecture/sui-tech-reference.md](docs/02-architecture/sui-tech-reference.md).

## Getting started

```sh
cp .env.example .env        # then fill in; never commit .env
pnpm install                # install the TypeScript workspaces
pnpm build                  # build all packages
pnpm test                   # run unit tests
cargo build --manifest-path engine/Cargo.toml   # build the Rust engine
sui move build --path move                       # build the Move package
```

## The one invariant

Nothing about verifying a past run may ever require a live or honest Reeg service.
The indexer is display-only and rebuildable; the Console is a static site; verification
reads only public Sui and Walrus data. See
[docs/02-architecture/security-and-threat-model.md](docs/02-architecture/security-and-threat-model.md).

## Live on testnet

The full operator loop runs on Sui testnet today, driven by the `reeg` CLI: create a Machine,
run commands in its working directory, Seal-encrypt the snapshot bundle, store the ciphertext on
Walrus (through the testnet upload relay), anchor the blob id and manifest hash on the Machine
object in one transaction, restore it byte-identically, share it with another address, fork it
with provable lineage, and verify it from public data with no Reeg backend.

- Move package: `0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28` (testnet).
- Testnet endpoints, Seal key server, and the package id are in [config/testnet.json](config/testnet.json).

The CLI signs with the local sui keystore in memory and never prints key material; the Walrus and
Seal endpoints and the package id come from config or the `REEG_*` environment. Point `REEG_ENGINE`
at the built Rust binary, then run the loop (spends a little testnet SUI + WAL):

```sh
cargo build --manifest-path engine/Cargo.toml          # builds the reeg-engine binary
export REEG_ENGINE=engine/target/debug/reeg-engine
export REEG_PACKAGE_ID=0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28
export REEG_OPERATOR=<your testnet address>            # signs; must hold SUI + WAL

reeg create                                            # mint a shareable Machine you own -> <machineId>
reeg run <machineId> -- sh -c 'echo hi > note.txt'     # run a command, captured in the log
reeg checkpoint <machineId>                            # pack -> encrypt -> Walrus -> anchor on Sui
reeg restore  <machineId> --dest /tmp/restored         # Walrus -> Seal decrypt -> byte-identical workdir
reeg grant    <machineId> <address> --role restore     # let another address decrypt and restore
reeg revoke   <machineId> <address>                    # stop future decryption (forward-looking)
reeg fork     <machineId>                              # child Machine recording lineage to the parent
reeg retire   <machineId>                              # permanent, verifiable end-of-life marker
reeg verify   <machineId>                              # independent verify, public Sui + Walrus only
reeg evidence <machineId> --out evidence.json          # export a portable record for an auditor
reeg audit    evidence.json                            # verify that record offline (no Reeg, no chain)
```

A grantee restores with their own key and no gas: `reeg restore <machineId> --dest <dir>
--operator <granteeAddress>`. Use `--until 7d` (or an ISO 8601 time) on a grant for a
time-limited share. Sharing rides on a shared `AccessPolicy` object (the Machine's `policy_id`)
that the Seal key servers read to decide decryption; grant and revoke also append GRANT and REVOKE
entries to the provenance chain, so the sharing history verifies offline like everything else.

For compliance (EU AI Act Article 12 tamper-evident record-keeping), `reeg evidence` exports a
portable file an auditor keeps and `reeg audit` verifies it offline with no Reeg and no Console;
`reeg audit --anchor` additionally re-confirms it against live Sui. See
[docs/03-engineering/compliance-evidence.md](docs/03-engineering/compliance-evidence.md).

Agent memory is checkpointed and verified with the environment: `reeg run` exposes a
`REEG_MEMORY_DIR` to the command, and whatever a memory backend (MemWal or plain files) writes
there is captured into the bundle, restored on any host, and bound into `manifest_hash`. See
[docs/03-engineering/agent-memory.md](docs/03-engineering/agent-memory.md).

Every `reeg` command is a thin wrapper over [@reeg/sdk](packages/sdk), so the same
create/run/checkpoint/restore/grant/revoke/fork/verify operations are callable directly from
TypeScript. The older single-shot script `pnpm --filter @reeg/test run live:checkpoint` still runs
create + checkpoint + verify end to end.

The headline acceptance demo runs the whole story across simulated hosts and asserts each step:

```sh
REEG_ENGINE=engine/target/debug/reeg-engine pnpm --filter @reeg/test run live:acceptance
```

It creates and checkpoints on host A, deletes host A, restores on a fresh host B that never saw it
(byte-identical, from Sui + Walrus alone), verifies offline, shares to a grantee who restores on a
third host, then revokes and confirms the grantee is denied. A restored run is byte-identical on
any host because the bundle is content-addressed; see
[docs/03-engineering/cross-host-portability.md](docs/03-engineering/cross-host-portability.md) for
what that does and does not guarantee.

Publishing is scripted: `REEG_NETWORK=testnet ./scripts/publish-package.sh` publishes `move/`
and writes the package id back into `config/testnet.json`.

## Status

Built and tested: the Move package (on testnet), the Rust snapshot engine, runtime adapter, and
`reeg-engine` binary, the TypeScript client (chain/storage/crypto/sdk), the `reeg` operator CLI,
the independent verifier, the Console, and the indexer. The full
create/run/checkpoint/restore/grant/revoke/fork/verify loop passes end to end on testnet from the
CLI, and the scripted acceptance demo passes the headline bar: a run checkpointed on one host
restores byte-identically on a fresh host that never saw it, verify passes on public data alone, a
grantee restores after a grant and is denied after a revoke (forward-looking) and after a
time-limit expires. For compliance, `reeg evidence` exports a portable record an auditor verifies
offline with `reeg audit` (and re-anchors to live Sui), mapped to EU AI Act Article 12. Agent
memory is captured, restored on a fresh host, and verified with the environment (its content hash
is part of `manifest_hash`). Remaining hardening (container/microVM isolation tiers,
committee/threshold sharing, Nautilus attested execution, mainnet/scale) and the full build
sequence with done-bars are in
[docs/03-engineering/build-roadmap.md](docs/03-engineering/build-roadmap.md).
