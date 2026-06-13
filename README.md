# Reeg

**GitHub for AI agents. Snapshot, prove, share, and move what your agents do.**

Reeg is the version-control and proof layer for AI-agent environments. It snapshots an agent's whole
working environment into a `Machine` you own on Sui: its filesystem and memory stored as
content-addressed blobs on Walrus, encrypted client-side with Seal, with a hash-chained provenance
log anchored on Sui that anyone can verify **offline, with no Reeg backend**. A run can be shared
with another address, forked with provable lineage, moved across hosts byte-identically, and
optionally **attested by a measured TEE** so you can prove *which code* produced it. Like GitHub for
agent runs, except the history cannot be rewritten and the environment is yours. Reeg is the layer,
not the sandbox: you run the agent, Reeg versions and proves what it did.

**Live on Sui mainnet.** The product, vision, architecture, and build plan live in
[docs/](docs/README.md). Start there.

## The four pillars

- **Own** — each environment is an owned Sui `Machine` object (the fast path). Only the owner mutates it.
- **Share** — checkpoints are Seal-encrypted client-side before they ever touch Walrus; a shared
  `AccessPolicy` object holds grants. `grant`/`revoke` (allowlist + time-limited) append to the
  provenance chain, and a committee **t-of-n** threshold is set at encryption time (`--threshold`).
- **Move** — `fork` from any checkpoint with provable on-chain lineage to the parent; `restore` a
  checkpoint on **any** host byte-identically (content-addressed + deterministic).
- **Prove** — an append-only, tamper-evident provenance head, verified **offline from public Sui +
  Walrus alone**. Plus the optional **Nautilus** tier: a reproducible AWS Nitro enclave attests the
  code that produced a checkpoint, verifiable offline against its pinned measurements.

## Layout

This is a monorepo. The shape matches [docs/03-engineering/repo-structure.md](docs/03-engineering/repo-structure.md).

| Path | What | Language |
| --- | --- | --- |
| [move/](move/) | on-chain `Machine`, provenance, `seal_approve` policies, attestation verifier | Move 2024 |
| [engine/](engine/) | snapshot/restore engine + runtime tiers (Local, OCI, Firecracker + jailer) | Rust |
| [enclave/](enclave/) | reproducible AWS Nitro attestation enclave (`.eif` + pinned PCRs) | Rust |
| [packages/chain/](packages/chain/) | Sui client: read `Machine`, build PTBs | TypeScript |
| [packages/storage/](packages/storage/) | Walrus adapter: store/read blobs | TypeScript |
| [packages/crypto/](packages/crypto/) | Seal adapter + Nautilus preimage/verify | TypeScript |
| [packages/verify/](packages/verify/) | the independent verifier (provenance + attestation, offline) | TypeScript |
| [packages/sdk/](packages/sdk/) | public SDK tying the adapters together | TypeScript |
| [packages/cli/](packages/cli/) | `reeg` CLI | TypeScript |
| [apps/console/](apps/console/) | Console, deployed as a static Walrus Site | TypeScript / React |
| [apps/indexer/](apps/indexer/) | display-only indexer, rebuildable from chain events | TypeScript |
| [config/](config/) | per-network config (testnet, mainnet) | JSON |
| [scripts/](scripts/) | provision, publish-package, build the Firecracker/Nitro bench | mixed |
| [test/](test/) | cross-package integration and end-to-end (incl. live) tests | TypeScript |

The Rust engine and the TypeScript client meet at one artifact boundary: a manifest plus
content-addressed files. The engine never imports a chain or storage client; the client never
reaches into engine internals.

### Runtime tiers

The same `Runtime` trait (and the *identical* capture + verify path) backs three tiers, so the
isolation boundary changes without touching the snapshot or verification:

- **Local** — runs commands directly on the host (dev, the loop, tests).
- **OCI** — `runc` container: read-only rootfs, a per-session tmpfs `/work`, network isolation.
- **Firecracker** — a microVM with KVM kernel-boundary isolation and an in-guest agent over vsock;
  optionally launched under the **jailer** (chroot + dropped privileges + cgroup v2).

## Toolchain

Pinned and config-driven, not hardcoded. See [.node-version](.node-version),
[rust-toolchain.toml](rust-toolchain.toml), and per-package manifests.

- Node >= 24, pnpm 10 (workspaces), Turborepo for task running, Biome for lint/format.
- Rust 1.95 (stable), Cargo workspace.
- Sui CLI 1.73, Walrus CLI for on-chain and storage operations.
- TypeScript 6, Vite 8 + React 19 (Console), Vitest for tests.

Platform SDKs are pinned to **current** releases: `@mysten/sui` ^2.17, `@mysten/walrus` ^1.1,
`@mysten/seal` ^1.1 (all at npm latest).

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

Nothing about verifying a past run may ever require a live or honest Reeg service. The indexer is
display-only and rebuildable; the Console is a static site; verification reads only public Sui and
Walrus data. See
[docs/02-architecture/security-and-threat-model.md](docs/02-architecture/security-and-threat-model.md).

## Live on Sui mainnet

The full operator loop is published and runs on Sui — driven by the `reeg` CLI: create a Machine,
run commands in its working directory, Seal-encrypt the snapshot bundle, store the ciphertext on
Walrus (through the upload relay), anchor the blob id and manifest hash on the `Machine` in one
transaction, restore it byte-identically, share it, fork it with provable lineage, and verify it
from public data with no Reeg backend.

- **Mainnet** package: `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`
  (upgraded from `0xf3e0…84f3` to add the attestation module).
- **Testnet** package: `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.
- Endpoints, the Seal key-server set, and the package id per network are in
  [config/mainnet.json](config/mainnet.json) / [config/testnet.json](config/testnet.json).

Measured mainnet cost is **~0.01 SUI + ~0.012 WAL** per create + encrypted checkpoint (1 epoch).

> **Honest note.** Mainnet has no free public Seal key server yet, so a Seal-*encrypted* checkpoint's
> **decrypt** (restore) currently waits on a provider key server; encryption, storage, anchoring, and
> **offline verification all work on mainnet today**. The full encrypted checkpoint → restore → verify
> loop is proven end to end on **testnet**.

The CLI signs with the local sui keystore in memory and never prints key material; endpoints and the
package id come from config or the `REEG_*` environment. Point `REEG_ENGINE` at the built Rust binary,
then run the loop:

```sh
cargo build --manifest-path engine/Cargo.toml          # builds the reeg-engine binary
export REEG_ENGINE=engine/target/debug/reeg-engine
export REEG_NETWORK=testnet                            # or mainnet
export REEG_OPERATOR=<your address>                    # signs; must hold SUI + WAL

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

A grantee restores with their own key and no gas (`reeg restore … --operator <granteeAddress>`).
Use `--until 7d` (or an ISO 8601 time) on a grant for a time-limited share. Sharing rides on a
shared `AccessPolicy` object that the Seal key servers read to decide decryption; grant and revoke
also append GRANT and REVOKE entries to the provenance chain, so the sharing history verifies
offline like everything else. Committee t-of-n decryption is set at checkpoint time with
`reeg checkpoint <machineId> --threshold <t>`.

### Prove which code ran (Nautilus, optional)

On an AWS Nitro host, a reproducible enclave attests checkpoints. Register it once, then attest:

```sh
reeg enclave register                                  # verify the enclave's Nitro doc on chain -> EnclaveConfig
reeg checkpoint <machineId> --attest --enclave-config <id>   # enclave signs the checkpoint; recorded on chain
```

`packages/verify` confirms the attestation **offline**: the on-chain signature verified, and the
enclave's PCRs match the reproducible build's measurements ([enclave/](enclave/)). It is strictly
additive — a checkpoint without `--attest` is byte-identical.

### Compliance & memory

For compliance (EU AI Act Article 12 tamper-evident record-keeping), `reeg evidence` exports a
portable file an auditor keeps and `reeg audit` verifies it offline with no Reeg and no Console;
`reeg audit --anchor` re-confirms it against live Sui. Agent memory is checkpointed and verified
with the environment: `reeg run` exposes a `REEG_MEMORY_DIR` to the command, and whatever a memory
backend writes there is captured into the bundle, restored on any host, and bound into
`manifest_hash`. See [docs/03-engineering/compliance-evidence.md](docs/03-engineering/compliance-evidence.md)
and [docs/03-engineering/agent-memory.md](docs/03-engineering/agent-memory.md).

Every `reeg` command is a thin wrapper over [@reeg/sdk](packages/sdk), so the same operations are
callable directly from TypeScript. The headline acceptance demo runs the whole story across
simulated hosts and asserts each step:

```sh
REEG_ENGINE=engine/target/debug/reeg-engine pnpm --filter @reeg/test run live:acceptance
```

It creates and checkpoints on host A, deletes host A, restores on a fresh host B that never saw it
(byte-identical, from Sui + Walrus alone), verifies offline, shares to a grantee who restores on a
third host, then revokes and confirms the grantee is denied.

## Status

**Live on mainnet, and feature-complete across all four pillars.** Built, tested, and verified:

- **On-chain** (Move, 40/40 tests): `Machine` + hash-chained provenance, `seal_approve` access
  policies (owner / allowlist / time-limited), fork lineage, retire, and the additive Nautilus
  **attestation** verifier — published to mainnet and testnet.
- **Engine** (Rust): the content-addressed snapshot engine and all three runtime tiers — Local, OCI,
  and Firecracker **including the jailer (#14)** — verified on a real AWS KVM host (Firecracker 8/8 +
  jailer, OCI 3/3, lib 11/11).
- **Nautilus** (live, testnet + mainnet): a **reproducible** Nitro enclave (cache-cleared rebuilds
  produce identical PCRs) signs checkpoint manifests; `register_enclave` + `register_attested_command`
  verify it on chain; `@reeg/verify` confirms it offline (54/54). The enclave *attests* results — it
  does not run the agent, so portability and offline verify are preserved.
- **Client + CLI** (TypeScript): chain/storage/crypto/sdk/verify, the `reeg` operator CLI, the
  independent verifier, the Console (a static Walrus Site), and the indexer.

The full create/run/checkpoint/restore/grant/revoke/fork/verify loop passes end to end, agent memory
is captured and verified with the environment, and CI is green on all three jobs (TypeScript, Rust,
Move). The detailed build sequence and done-bars are in
[docs/03-engineering/build-roadmap.md](docs/03-engineering/build-roadmap.md).
