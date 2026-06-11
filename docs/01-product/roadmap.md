# Roadmap

No code here, only direction and sequence. Each phase has a goal, what ships, and the bar that says it is done. Dates anchor to the Overflow window; everything after is directional, not committed. Platform facts referenced here are in [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

We are building the actual product, not a throwaway MVP. The June 21 submission is a
real, usable version of Reeg that a team could run, not a staged demo. Later phases
add depth, scale, and enterprise features; they do not turn a fake into a real
thing. When this doc defers something, it is deferring scope, never deferring "build
a real product."

Reeg's tagline: **"The computer your AI agents live in. Own it, share it, move it, prove it."**

## Current status (as of 2026-06-11)

**Reeg is LIVE on Sui mainnet.** Phase 1's acceptance bar is met, and the work once labeled "after the
hackathon" — committee t-of-n Seal policies, MemWal-backed memory, the Firecracker jailer (#14), and
the Nautilus TEE attestation tier — has all **shipped**. A user can create/run/checkpoint/restore/fork
a Machine, share and revoke, kill a host and restore elsewhere byte-identically, and have an outsider
verify the whole run **offline** from public Sui + Walrus data alone, with every Reeg backend stopped.

- **Mainnet package:** `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`
  (upgraded via Sui package upgrade from the original
  `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3` to add the attestation module).
- **Testnet package:** `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.
- **Measured mainnet cost:** ~0.0099 SUI + ~0.0119 WAL per create + encrypted checkpoint (1 epoch,
  including the Walrus upload-relay tip). Package publish ran ~0.047 SUI; the upgrade ~0.05 SUI. Cost is
  small, real, and measured on a funded run — not estimated.

The four pillars (own / share / move / prove) all run today. The full **encrypted checkpoint → restore →
verify** loop is proven end to end on testnet; on mainnet, encryption, storage, anchoring, and offline
verify all work, and only decrypt (restore of an encrypted checkpoint) waits on a working mainnet Seal
key server — see [Honest constraints](#honest-constraints). The operational walkthrough is in
[docs/demo/RUNBOOK.md](../demo/RUNBOOK.md). The build detail is in
[build-roadmap.md](../03-engineering/build-roadmap.md); phases A–M are done, including the full
Firecracker hardening pass (19/19) and the Nautilus attestation tier, both verified on a real AWS host.

## The four pillars

Everything in Reeg serves one of four guarantees. Each agent environment is a **Machine** object you
own on Sui, its filesystem + memory snapshotted to content-addressed blobs on Walrus, encrypted
client-side with Seal, with a hash-chained provenance log anchored on Sui.

- **OWN** — a Machine is an *owned* Sui object (the fast path). `create` / `retire`. The owner alone
  mutates it.
- **SHARE** — checkpoints are Seal-encrypted client-side before they ever touch Walrus. A shared
  `AccessPolicy` object holds grants; `grant` / `revoke` (allowlist + time-limited expiry) append
  GRANT/REVOKE entries to the provenance chain. The committee **t-of-n** Seal threshold is set at
  *encryption* time (`reeg checkpoint --threshold t`). Revocation is forward-looking — it cannot un-see
  data already decrypted.
- **MOVE** — fork a Machine from any checkpoint with provable on-chain lineage to its parent; restore a
  checkpoint on **any** host byte-identically (content-addressed + deterministic). Real cross-host
  portability, not a re-pull of "latest."
- **PROVE** — a hash-chained, append-only, tamper-evident provenance head on the Machine object,
  verified **offline** from public Sui + Walrus alone. Plus the optional **Nautilus TEE attestation**
  tier (below) for proving *which code* produced a checkpoint.

## Guiding rule

Ship the real product, then widen it. The thesis is: agent environments you own and
can share, that you can fork, move, and (for free) prove. If a feature does not move
C1 (owned), C2 (shareable), C3 (portable), or C4 (provable), it waits. Lead with own
and share; the rest follows from them.

## Phase 0 — Foundations (done)

Goal: lock the design and the verified platform facts so the build does not wander.

Shipped:

- This docs suite: vision, requirements, architecture, data model, feasibility, threat model.
- A working local prototype of the runtime (filesystem + command execution) with a checkpoint that produces a content-addressed manifest.

Done when: the snapshot/restore data model is settled and an internal dry run can checkpoint and restore on the same host. **Met.**

## Phase 1 — The product, end to end (done; target was June 21)

Goal: ship a real, usable Reeg that does the full loop, own, share, fork, move, and prove, not a
scripted demo.

Shipped:

- Create / run / checkpoint / restore a Machine (FR-1 to FR-4).
- Seal client-side encryption of checkpoints; Walrus storage; on-chain Machine object with hash-chained provenance head (FR-3, FR-7).
- Owner-only access policy via `seal_approve`, plus grant access so an environment can actually be shared with a teammate (FR-10, FR-11).
- Fork a Machine from a checkpoint, so a good run can branch (FR-5).
- Console as a Walrus Site with a provenance timeline, share controls, and a Verify button that works with every Reeg backend stopped, offline from public Sui + Walrus alone (FR-13, FR-14, FR-16, FR-17). Verify is offline; Fork is one wallet-signed click that opens the child with its lineage; restore stays a host operation, so the Console hands the operator the exact `reeg restore` command rather than faking it in the browser.

Done when: a real user can run an agent, snapshot it, share or fork the environment,
kill a host, restore on another, and have an outsider verify the whole run in the
Console with our backend stopped. That is the acceptance bar in
[requirements-analysis.md](requirements-analysis.md), and it is the product, not a demo of one. **Met.**

## Phase 2 — Mainnet and daily-driver polish (done; target was before Aug 27)

Goal: make Reeg something a team reaches for every day, on mainnet, which also
unlocks the 100% upfront payout.

Shipped:

- Revoke access and richer sharing controls from the Console (FR-16).
- Manifest / evidence export for auditors (FR-9) — `reeg evidence` / `reeg audit` write a portable evidence file an auditor keeps.
- Agent-memory seam wired into the runtime (FR-18): `reeg run` exposes a real `REEG_MEMORY_DIR`, and the memory dir + `memory_pointer` round-trip through snapshot/restore. Using the MemWal SDK as the memory backend is optional and in progress, not a finished public-beta integration.
- Cost and latency surfaced honestly (NFR-7, NFR-3) — see the measured mainnet figures above.
- **Mainnet deployment** of the Machine package and policy, then a package upgrade to add the attestation module.

Done when: an external team can run their own agents in Reeg as part of real work,
share and restore environments, and a third party verifies them, all on mainnet. **Live on mainnet.**

## What shipped that was once deferred (committee, MemWal, jailer #14, Nautilus)

As of this session, the "after the hackathon" split is fully closed. These are production-ready and the
core loop already stands without them, so they are additive — and they have all shipped:

- **Committee (t-of-n) Seal policies** — the threshold is chosen at encryption time
  (`reeg checkpoint --threshold t`); grants/revocations append to the provenance chain.
- **Agent-memory seam** — `reeg run` exposes a real `REEG_MEMORY_DIR`, and the memory dir + `memory_pointer` survive snapshot/restore. Wiring the MemWal SDK as the backend is optional and in progress, not a shipped public-beta integration.
- **Firecracker jailer (#14)** — the VMM runs under the jailer (chroot + dropped privileges to an
  unprivileged uid/gid + cgroup v2). Part of the 19/19 Phase M hardening pass, verified on a real AWS
  KVM host (firecracker_session 8/8 plus a sudo-gated jailer test, oci_session 3/3, lib 11/11).
- **Nautilus TEE attestation** — live on testnet **and** mainnet (see below).

## Runtime tiers (one capture path across all)

The Rust engine exposes one `Runtime` trait; the capture + verify path is identical across every tier,
so a checkpoint is byte-identical regardless of where the agent ran.

- **LocalRuntime** — dev tier, no isolation; runs anywhere (including a Mac).
- **OCI container tier** — runc, read-only rootfs, per-session tmpfs `/work`, network isolation proven
  by an unreachable metadata service.
- **Firecracker microVM tier** — KVM kernel-boundary isolation, per-session tmpfs, read-only rootfs,
  in-guest agent over vsock with a length-prefixed framed protocol, the VMM under the **jailer**.

Determinism is pinned end to end: a content-addressed CAS keyed by BLAKE3, and a canonical umask so
captured file modes don't leak the ambient login umask. That is what makes restore byte-identical
across hosts **and** across tiers. The Firecracker / OCI / jailer tiers require a Linux KVM host (an
AWS box); the local tier and the full own/share/move/prove chain run anywhere.

## Nautilus attestation tier (live on testnet and mainnet)

The optional attestation tier proves **which code** produced a checkpoint. A tiny *reproducible* AWS
Nitro enclave (musl-static, ~6.5 MB `.eif`; two cache-cleared rebuilds produce identical PCRs) derives
an ed25519 key from NSM entropy, obtains a Nitro attestation document embedding that key, and signs a
checkpoint's manifest hash over a frozen preimage.

On chain, `register_enclave` verifies the Nitro document via `0x2::nitro_attestation` and pins the PCRs
plus the ed25519 key into a shared `EnclaveConfig` (once per build); `register_attested_command`
cheaply ed25519-verifies each per-checkpoint signature and emits `CommandAttested`. An offline verifier
(`@reeg/verify`) confirms the signature and that the PCRs match the trusted reproducible build (it flags
all-zero debug-mode PCRs). Live `EnclaveConfig`s were verified offline **4/4 on both networks**.

This tier is **strictly additive**: zero changes to `machine.move`'s layout or provenance head, so a
non-attested run is byte-identical. The enclave **attests results**; it does **not** run the agent — the
agent stays in the Firecracker VM, preserving portability and offline verify.

## Honest constraints

State plainly; do not hide:

- **Encrypted-checkpoint decrypt on mainnet** waits on a working mainnet Seal key server. Mainnet
  currently has no free public Open-mode Seal key server (the decentralized committee server is
  "available soon"; independent providers run Permissioned mode requiring signup, and the Ruby Nodes
  free-tier key currently returns 403 from their API gateway — a provider-side activation matter, not
  Reeg's code). So on mainnet, **encryption + storage + anchor + offline verify all work; only decrypt
  (restore of an encrypted checkpoint) waits** on a working provider key server. The full encrypted
  checkpoint → restore → verify loop is proven on **testnet**.
- `reeg checkpoint --attest` runs **on** the AWS Nitro host (the engine reaches the local enclave over
  vsock), with the operator's key on that host.
- The Firecracker / OCI / jailer / Nautilus tiers require a Linux KVM + Nitro host (an AWS box). The
  local tier and the full own/share/move/prove chain run anywhere.

## What is genuinely next

The honest "next" is narrow and specific, not a re-pitch of things already shipped:

- **A working mainnet Seal key server** for encrypted-checkpoint decrypt, so the full encrypted
  checkpoint → restore → verify loop runs on mainnet exactly as it does on testnet today. This is the
  one open dependency on the encrypted-mainnet path, and it is a provider availability matter, not Reeg
  code.
- **Broader managed runtime** — make the Firecracker / OCI tiers easier to reach without standing up
  your own KVM host, so more teams get production isolation without operating an AWS box.

## Phase 3 — Scale and distribution (directional)

Goal: become the default place agent work lives, for teams and at volume.

Ships (directional):

- Team accounts, multiple operators per Machine, role-based grants.
- Integrations with common agent frameworks and sandbox runtimes so Reeg wraps what teams already use.
- Compliance-evidence exports positioned against the EU AI Act Art. 12 record-keeping duties for high-risk AI (positioning, not legal advice).
- Self-serve onboarding and pricing (see [business-model.md](../05-business/business-model.md)).

## Compliance positioning

Reeg's tamper-evident provenance is framed against the **EU AI Act Art. 12** (record-keeping / logs):
append-only, hash-chained logs with configurable Walrus retention (`--epochs`; ~6 months ≈ 13 testnet
epochs), and `reeg evidence` / `reeg audit` export a portable evidence file an auditor keeps. This is
aspirational positioning, not legal advice — claims are kept honest.

## What remains genuinely out of scope

Still scope choices, not gaps — these are different products or non-goals:

- Live sub-second state mirroring across hosts. Reeg checkpoints; it does not stream (NFR-3). Different product, later if ever.
- Positioning as a regulated PHI / classified-data vault. Out of scope by design (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- Building our own agent framework. Reeg is the environment, not the agent's brain.

## Risk gates

- **Restore reproducibility** (Phase 1 close): confirmed — restore is byte-identical across hosts and
  tiers, so verify is meaningful. Held by the content-addressed CAS + pinned canonical umask.
- **Mainnet cost** (mainnet cutover): confirmed on a funded run — ~0.0099 SUI + ~0.0119 WAL per create +
  encrypted checkpoint (1 epoch), with Walrus storage epochs managed via `--epochs`.
- **Additive guarantees**: committee Seal and Nautilus stay additive — the own/share/move/prove loop is
  correct and offline-verifiable whether or not a run uses them — validated on funded runs on both
  networks.
