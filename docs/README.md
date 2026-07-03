# Reeg Documentation

**Git tracks code. Reeg tracks the environment where the work happened.** Reeg is version control for environments. Reeg lets developers and AI agents checkpoint, restore, share, fork, and verify complete computing environments. Every checkpoint is encrypted before it leaves your machine, stored on Walrus, and anchored on Sui, allowing environments to be restored byte-identically on any host and independently verified without trusting Reeg. You run the work (your agent, your container, your microVM, someone
else's cloud) and at every commit Reeg snapshots the whole working state, encrypts it client-side,
and anchors a tamper-proof record of what happened. The environment is a **Machine** object you own
on Sui, backed by your own content-addressed data on Walrus, encrypted with Seal, with a
hash-chained provenance log anchored on Sui that anyone can verify **offline** from public Sui +
Walrus data alone, no Reeg backend. The history cannot be rewritten and the environment is yours.
Reeg is the layer over the sandbox you already use, not a sandbox, a server, or an OS: you run the
work, Reeg versions and proves what it did. Agents are the wedge, the first place people felt the
loss, but the same layer preserves, moves, and proves any environment you run.

The four pillars: **Own** what you run (an object you hold, not a row you rent). **Share** the live
workspace, not a transcript. **Move** it (kill it here, bring it back there, identical). **Prove**
the whole history to anyone, with Reeg switched off. GitHub history can be rewritten; this cannot.

Domain: [reeg.xyz](https://reeg.xyz) · Status:
**LIVE on Sui mainnet** (and testnet), including the optional Nautilus TEE attestation
tier.

- Mainnet package: `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`
- Testnet package: `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`
- Measured mainnet cost: ~0.0099 SUI + ~0.0119 WAL per create + encrypted checkpoint
  (1 epoch, incl. Walrus upload-relay tip).

---

## The four pillars

- **Own**: a Machine is an *owned* Sui object (fast path). `create` / `retire`; the
  owner alone mutates it.
- **Share**: checkpoints are Seal-encrypted client-side before they ever touch Walrus.
  A shared `AccessPolicy` holds grants; `grant` / `revoke` (allowlist + time-limited
  expiry) append GRANT/REVOKE entries to the provenance chain. The t-of-n Seal threshold
  is set at encryption time; revocation is forward-looking.
- **Move**: `fork` a Machine from any checkpoint with provable on-chain lineage to the
  parent; `restore` a checkpoint on *any* host byte-identically (content-addressed +
  deterministic). Cross-host, cross-runtime-tier portability.
- **Prove**: a hash-chained, append-only, tamper-evident provenance head on the Machine
  object, verified offline from public Sui + Walrus alone, plus the optional Nautilus
  TEE attestation tier that proves *which code* produced a checkpoint.

---

## Who each doc is for

| If you are...                          | Start here |
|----------------------------------------|------------|
| A teammate joining the build           | [00-overview/product-vision.md](00-overview/product-vision.md), then [ai/AGENTS.md](ai/AGENTS.md) |
| A non-technical person ("what is this")| [00-overview/product-vision.md](00-overview/product-vision.md) |
| An investor                            | [whitepaper/reeg-whitepaper.md](whitepaper/reeg-whitepaper.md), [05-business/business-model.md](05-business/business-model.md) |
| An engineer about to write code        | [02-architecture/system-architecture.md](02-architecture/system-architecture.md), [03-engineering/engineering-standards.md](03-engineering/engineering-standards.md) |
| An AI agent working on this repo       | [ai/AGENTS.md](ai/AGENTS.md) |

---

## Map of the documentation

### 00 - Overview

- [product-vision.md](00-overview/product-vision.md) - what Reeg is, who it is for, why it exists, in plain language.
- [glossary.md](00-overview/glossary.md) - every term, defined once.

### 01 - Product

- [requirements-analysis.md](01-product/requirements-analysis.md) - functional and non-functional requirements, prioritized.
- [swot.md](01-product/swot.md) - strengths, weaknesses, opportunities, threats.
- [personas-and-use-cases.md](01-product/personas-and-use-cases.md) - who uses it and for what.
- [roadmap.md](01-product/roadmap.md) - product phases and direction, no code.

### 02 - Architecture

- [system-architecture.md](02-architecture/system-architecture.md) - the full system, components, and how they connect.
- [data-model.md](02-architecture/data-model.md) - the on-chain objects, the off-chain records, and the verification chain.
- [sui-tech-reference.md](02-architecture/sui-tech-reference.md) - verified reference for Walrus, Seal, Nautilus, Move objects, PTBs.
- [security-and-threat-model.md](02-architecture/security-and-threat-model.md) - what we defend against and how.
- [diagrams/](02-architecture/diagrams/) - architecture diagrams as JSON (render to images yourself).

### 03 - Engineering

- [engineering-standards.md](03-engineering/engineering-standards.md) - how we write code so it actually works and scales.
- [build-roadmap.md](03-engineering/build-roadmap.md) - the engineering build sequence, phase by phase, easy to hard, with done bars. No code.
- [manifest-spec.md](03-engineering/manifest-spec.md) - the frozen manifest and artifact-boundary contract between the Rust engine and the TypeScript client.
- [repo-structure.md](03-engineering/repo-structure.md) - the monorepo layout.
- [tech-stack.md](03-engineering/tech-stack.md) - every technology choice and why.
- [testing-strategy.md](03-engineering/testing-strategy.md) - what we test, at what level, and the one test that matters most.

### 05 - Business

- [business-model.md](05-business/business-model.md) - how Reeg makes money.
- [brand-and-domain.md](05-business/brand-and-domain.md) - name, domain, email, and identity plan.

### Whitepaper

- [reeg-whitepaper.md](whitepaper/reeg-whitepaper.md) - the standalone document you can share publicly.

### AI

- [ai/AGENTS.md](ai/AGENTS.md) - single source of truth an AI agent loads to know everything about the build.

---

## What's shipped

- **On chain (Move 2024).** Machine objects, provenance head, AccessPolicy
  grant/revoke, and the optional `attestation` module, live on **mainnet** and
  testnet. Move tests 40/40.
- **Snapshot engine (Rust).** Content-addressed CAS keyed by BLAKE3, deterministic,
  byte-identical restore across hosts *and* runtime tiers (a canonical umask is pinned
  so file modes don't leak the ambient login umask). The Rust engine and TS client meet
  at one artifact boundary: a manifest + content-addressed files; the engine never
  imports a chain/storage client.
- **Runtime tiers (one `Runtime` trait, identical capture + verify path).** Local (dev,
  no isolation); OCI container tier (runc, read-only rootfs, per-session tmpfs,
  network isolation proven by an unreachable metadata service); Firecracker microVM tier
  (KVM kernel-boundary isolation, in-guest agent over vsock). Phase M hardening 19/19
  complete and verified on a real AWS KVM host, including running the VMM under the
  **jailer** (chroot, dropped privileges to an unprivileged uid/gid + cgroup v2).
- **Nautilus attestation tier (optional).** A reproducible AWS Nitro enclave
  (~6.5MB `.eif`, identical PCRs across cache-cleared rebuilds) signs a checkpoint's
  manifest hash; `register_enclave` pins the PCRs + ed25519 key on chain, and an offline
  verifier (`@reeg/verify`) confirms the signature against the trusted reproducible
  build. Strictly additive. A non-attested run is byte-identical. The enclave *attests*
  results; it does not run the agent.
- **Verification is offline.** `@reeg/verify` (54/54 tests) replays the provenance chain
  and validates attestations using only public Sui + Walrus data.

See [build-roadmap.md](03-engineering/build-roadmap.md) for the full phase-by-phase
status and [data-model.md](02-architecture/data-model.md) for the object model.

---

## Honest constraints

- A Seal-**encrypted** checkpoint on **mainnet** needs a working mainnet Seal key
  server. Today mainnet has no free public Open-mode key server (the decentralized
  committee server is "available soon"; independent providers run Permissioned mode
  requiring signup). So on mainnet, **encryption + storage + anchor + offline verify
  all work; only decrypt (restore) waits on a working provider key server.** The full
  encrypted checkpoint → restore → verify loop is proven end-to-end on **testnet**.
- The Firecracker / OCI / jailer / Nautilus tiers require a Linux KVM + Nitro host (an
  AWS box). The local tier and the full own/share/move/prove chain run anywhere.
- `reeg checkpoint --attest` runs on the AWS Nitro host (the engine reaches the local
  enclave over vsock), with the operator's key on that host.

---

## How to keep these docs honest

1. Every factual claim about Sui, Walrus, Seal, or Nautilus must trace to
   [02-architecture/sui-tech-reference.md](02-architecture/sui-tech-reference.md),
   which cites primary sources.
2. When the build changes, update the doc in the same change. Stale docs are worse
   than no docs.
3. The whitepaper and product vision are the only docs written for outsiders.
   Everything else assumes the reader is on the team.
4. Keep the honest constraints honest: distinguish what is live on mainnet, proven on
   testnet, and aspirational positioning (e.g. EU AI Act framing).
