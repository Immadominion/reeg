# Tech Stack

What Reeg is built with and why each piece is here. For background on the underlying Sui/Walrus/Seal primitives, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

> GitHub for AI agents. Snapshot, prove, share, and move what your agents do.

Reeg makes each AI-agent environment a **Machine** object you own on Sui: its filesystem and memory are snapshotted to content-addressed blobs on Walrus, encrypted client-side with Seal, with a hash-chained provenance log anchored on Sui that anyone can verify **offline** from public Sui + Walrus data alone — no Reeg backend. Reeg is **live on Sui mainnet**.

## On-chain

- Sui (Move, 2024 edition) for the Machine object, ownership, and the provenance anchor. Chosen because state lives in owned objects with capability-based access control, and because PTBs let us register a checkpoint and append provenance atomically in one transaction. A Machine is an **owned** Sui object (the fast path) — the owner address is the authority and alone mutates it; Reeg is not.
  - Mainnet package: `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e` (upgraded via Sui package upgrade from the original `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3` to add the attestation module).
  - Testnet package: `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.
  - Measured mainnet cost: ~0.0099 SUI + ~0.0119 WAL per (create + encrypted checkpoint, 1 epoch, including the Walrus upload-relay tip). Package publish ~0.047 SUI; upgrade ~0.05 SUI.
- Seal for client-side encryption and on-chain access policy (`seal_approve`). Chosen because Walrus blobs are public, so encryption must happen before upload, and because the access decision belongs on-chain where the owner controls it, not in a Reeg database. Checkpoints are Seal-encrypted client-side **before they ever touch Walrus**. A shared `AccessPolicy` object holds grants; `grant`/`revoke` (allowlist + time-limited expiry) append `GRANT`/`REVOKE` entries to the provenance chain. The committee t-of-n Seal threshold is set at **encryption time** (`reeg checkpoint --threshold t`); revocation is forward-looking (it cannot un-see already-decrypted data). SDK: `@mysten/seal`.

## Storage

- Walrus for checkpoint blobs. Chosen for durable, content-addressed storage where `blob_id` is the content hash, which gives us integrity for free and verification without trusting Reeg. We accept that Walrus is durability, not low latency, and design around commit-boundary checkpoints (NFR-3 in [requirements-analysis.md](../01-product/requirements-analysis.md)). SDK: `@mysten/walrus`.
- Agent memory rides inside the same owned, checkpointed environment: the snapshot captures the working directory plus an optional agent memory dir (`memory_pointer` round-trips), so memory is part of the same content-addressed, verifiable artifact.

## The four pillars

- **OWN** — a Machine is an owned Sui object (fast path); `create`/`retire`. The owner alone mutates it.
- **SHARE** — checkpoints are Seal-encrypted client-side before upload; a shared `AccessPolicy` holds allowlist + time-limited grants; `grant`/`revoke` append to the provenance chain; the t-of-n threshold is fixed at encryption time.
- **MOVE** — fork a Machine from any checkpoint with provable on-chain lineage to the parent; restore a checkpoint on **any** host byte-identically (content-addressed + deterministic). Cross-host portability.
- **PROVE** — a hash-chained, append-only, tamper-evident provenance head on the Machine object, verified **offline** from public Sui + Walrus alone, plus the optional Nautilus TEE attestation tier (below).

## Off-chain / application

We pick the best language per layer instead of forcing one language everywhere. The split follows a clean artifact boundary (a manifest plus content-addressed files), so the two sides stay independent.

- Rust for the snapshot/restore engine and the runtime/sandbox core. This layer captures and rebuilds byte-exact environment state, walks the filesystem, computes content hashes and deltas, and controls process execution. Reproducibility, performance, and low-level control decide whether restore is trustworthy at all, and Rust is the right tool for that, with no GC pauses and exact memory and byte control. It also sits in good company: Walrus core and the Seal key servers are Rust, and the sandbox layer (Firecracker) is Rust, so we stay native to the ecosystem we depend on.
- TypeScript for the Sui/Walrus/Seal client and glue layer, the public SDK, the CLI, the indexer, and the Console. The official `@mysten/sui`, `@mysten/seal`, and `@mysten/walrus` SDKs are TypeScript-first, so the chain, storage, and encryption integration is fastest and least error-prone in TS. The SDK and CLI live where our users already are (the JS/TS agent ecosystem), and the Console is a Walrus Site, so it must run in the browser, which forces TS there regardless.
- The Rust engine and TS client meet at **one** artifact boundary (a manifest + content-addressed files). The engine produces and consumes a manifest (content hashes plus deltas) and content-addressed files; the TypeScript client encrypts, uploads to Walrus, and anchors on Sui. The engine never imports a chain/storage client, and neither side reaches into the other's internals — matching the adapter separation in [repo-structure.md](repo-structure.md).
- The runtime surface is kept narrow on purpose so that restore can be reproducible enough for verification to mean something.
- Console deployed as a Walrus Site (static, no privileged backend) so the demo has no hidden server doing the trusting.
- An off-chain indexer for Console responsiveness, rebuildable from chain events and never on the verification trust path.

## Snapshot engine (Rust)

Crates: `snapshot` / `runtime` / `cli`. A content-addressed store (CAS) keyed by BLAKE3; deterministic; **byte-identical restore across hosts and runtime tiers**. A canonical umask is pinned so captured file modes don't leak the ambient login umask (cross-tier determinism). Captures the working directory plus an optional agent memory dir (`memory_pointer` round-trips). The Rust engine and TS client meet at one artifact boundary; the engine never imports a chain/storage client.

## Runtime tiers (Rust)

One `Runtime` trait, with an identical capture + verify path across every tier:

- **LocalRuntime** — dev, no isolation. Runs anywhere.
- **OCI container tier** — `runc`, read-only rootfs, per-session tmpfs `/work`, network isolation proven by an unreachable metadata service.
- **Firecracker microVM tier** — KVM kernel-boundary isolation, per-session tmpfs, read-only rootfs, in-guest agent over vsock with a length-prefixed framed protocol.

Phase M hardening is **19/19 complete**, verified on a real AWS KVM host — including running the Firecracker VMM under the **jailer** (chroot + dropped privileges to an unprivileged uid/gid + cgroup v2). Tests on KVM: `firecracker_session` 8/8 plus a sudo-gated jailer test, `oci_session` 3/3, `lib` 11/11.

The Firecracker / OCI / jailer tiers require a Linux KVM host (an AWS box); the local tier plus the full own/share/move/prove chain run anywhere.

## Nautilus attestation tier (optional)

Proves **which code** produced a checkpoint. **Live on testnet and mainnet.** A tiny **reproducible** AWS Nitro enclave (musl-static, ~6.5 MB `.eif`; two cache-cleared rebuilds produce identical PCRs) derives an ed25519 key from NSM entropy, obtains a Nitro attestation document embedding that key, and signs a checkpoint's manifest hash over a **frozen** preimage.

- On chain: `register_enclave` verifies the Nitro document via `0x2::nitro_attestation` and pins the PCRs + ed25519 key into a shared `EnclaveConfig` (once per build); `register_attested_command` cheaply ed25519-verifies each per-checkpoint signature and emits `CommandAttested`.
- An offline verifier (`@reeg/verify`) confirms the signature and that the PCRs match the trusted reproducible build (it flags all-zero debug-mode PCRs). Live `EnclaveConfig`s verified offline 4/4 on both networks.
- **Strictly additive**: zero changes to `machine.move`'s layout/provenance head, so a non-attested run is byte-identical. The enclave **attests results; it does not run the agent** — the agent stays in the Firecracker VM, preserving portability and offline verify.
- `reeg checkpoint --attest` runs **on** the AWS Nitro host (the engine reaches the local enclave over vsock), with the operator's key on that host. The Nitro/Firecracker/OCI/jailer tiers require a Linux KVM + Nitro host.

## CLI (`reeg`)

`create`, `run`, `checkpoint` (`--epochs`, `--threshold`, `--attest --enclave-config`), `restore`, `fork`, `grant`, `revoke`, `retire`, `verify`, `evidence`, `audit`, `enclave register`. The TS CLI shells to a Rust engine binary (`reeg-engine`) for snapshot/restore and, on the Nitro host, the enclave vsock client.

## Why not one language

- Why not all TypeScript: the snapshot engine needs byte-exact, reproducible state capture and tight control over the filesystem and processes. A garbage-collected runtime makes byte-for-byte reproducibility and performance harder exactly where the whole product's trust depends on it. Convenience is not worth weakening the load-bearing part.
- Why not all Rust: the Sui, Walrus, and Seal SDKs are TypeScript-first, and the Console must run in the browser as a Walrus Site. Forcing Rust on the client layer would mean fighting the official SDKs and reimplementing browser glue for no benefit. Use TS where the ecosystem is TS-first.
- The cost of two languages is one clean serialization boundary, which we want anyway for testability and for letting the engine and client evolve independently.

## Versions

All `@mysten` SDK versions are at npm **latest**.

- Sui (Move 2024 edition)
- `@mysten/sui` 2.17
- `@mysten/walrus` 1.1.7 — content-addressed blob storage
- `@mysten/seal` 1.1.3 — threshold encryption + on-chain `seal_approve` access policies
- `@mysten/dapp-kit`, `bcs`
- Sui CLI 1.73.1, Walrus CLI
- Rust 1.95 (engine)
- Monorepo: pnpm 10 + Turborepo, Biome lint/format
- React 19 + Vite 8 Console (deployed as a static Walrus Site)
- Next 16 marketing site (reeg.xyz)

## Tests / CI

- Move 40/40 (including attestation with a real ed25519 vector)
- `@reeg/verify` 54/54
- `@reeg/chain` 21/21
- `@reeg/crypto` 8/8 (cross-language preimage match vs the Move vector)
- Engine on KVM: Firecracker 8/8 + jailer + OCI 3/3 + lib 11/11
- CI is green on all 3 jobs: TypeScript (build/lint/test), Rust (fmt/clippy/test), Move (build/test).

## Compliance

Framed against the EU AI Act Art. 12 (record-keeping / logs): tamper-evident provenance with configurable Walrus retention (`--epochs`; ~6 months ≈ 13 testnet epochs); `reeg evidence` / `reeg audit` export a portable evidence file an auditor keeps. (Aspirational positioning, not legal advice — claims kept honest.)

## Honest constraints

- A Seal-**encrypted** checkpoint on **mainnet** needs a mainnet Seal key server. Mainnet currently has no free public Open-mode Seal key server (the decentralized committee server is "available soon"; independent providers run Permissioned mode requiring signup). The Ruby Nodes free-tier key currently returns 403 from their API gateway (a provider-side activation matter, not Reeg's code). So on mainnet: **encryption + storage + anchor + offline verify all work**; only **decrypt** (restore) waits on a working provider key server. The full encrypted checkpoint → restore → verify loop is proven on **testnet**.
- `reeg checkpoint --attest` runs on the AWS Nitro host (the engine reaches the local enclave over vsock), with the operator's key on that host.
- The Firecracker / OCI / jailer / Nautilus tiers require a Linux KVM + Nitro host (an AWS box); the local tier plus the full own/share/move/prove chain run anywhere.

## Why this combination wins

The stack is the moat. Sui makes each environment an owned object the operator controls; Walrus makes stored state content-addressed and durable; Seal makes it private without handing keys to Reeg; Nautilus lets an enclave prove which code produced a result. Together they let you **own** an agent's environment, **share** or fork it, **move** it across hosts, and (for free) let an outsider **prove** a run by verifying it **offline** from public Sui + Walrus data alone, with no Reeg server in the loop — which no database-backed sandbox can match. The Rust engine makes restore byte-reproducible enough that the proof actually means something. See [system-architecture.md](../02-architecture/system-architecture.md) for how the pieces connect.

## Versioning and config

- Network endpoints (Sui RPC, Walrus aggregator/publisher, Seal key server ids) are configuration in `config/`, so testnet and mainnet differ only by config, not code.
- The Move package is designed for layout-compatible upgrades; struct changes consider on-chain layout from day one — proven in practice by the mainnet upgrade that added the attestation module without disturbing the provenance head.
