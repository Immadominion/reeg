# Engineering Build Roadmap

This is the build sequence, not the product timeline. The product
[roadmap.md](../01-product/roadmap.md) says what ships and when; this document says how
we build it, phase by phase, in dependency
order from the easiest, most certain work to the hardest. It contains no code. It is
the standard we will not build below: each phase names a goal, what it produces, the
**done bar** that says it is finished, and the requirements and claims it advances.

We are building the whole product, not an MVP and not a scripted demo. Phases late in
this list are real features real users will want, sequenced after the ones they depend
on, never deferred because the product is incomplete without them.

**Reeg is live.** Tagline: *Reeg is infrastructure for portable computing environments. We
started with AI agents because they're the fastest-growing source of ephemeral work, but
the underlying system can preserve and move any environment.* Reeg sits over the sandbox you already run; each environment is a
**Machine** object you own on Sui; its filesystem and memory are snapshotted to
content-addressed blobs on Walrus, encrypted client-side with Seal, with a hash-chained
provenance log anchored on Sui that anyone can verify **offline** from public Sui and
Walrus data alone, with no Reeg backend. Agents are the first use case, not the ceiling: the
same layer preserves, moves, and proves any environment you run.

## Status at a glance

Updated 2026-06-11. Legend: ✅ done · 🟡 partial · ⏸️ out of scope.
Each phase header below carries its own **Status** line; this is the summary:

- ✅ **A–H**: foundation, snapshot engine, OCI tier, Move/provenance, client adapters, verifier, CLI/SDK, Console/indexer
- ✅ **I**: owner-only + allowlist + time-lock done; committee t-of-n surfaced via `reeg checkpoint --threshold t` (threshold pinned at encryption time)
- ✅ **J**: cross-host acceptance demo (run → checkpoint → kill → restore → verify → grant → revoke)
- 🟡 **K**: memory seam done (`REEG_MEMORY_DIR`, `memory_pointer` round-trips, captured/verified with the workdir); MemWal as an optional backend remains
- ✅ **M**: Firecracker tier hardened + verified on AWS KVM, **19/19** including **#14 jailer** (chroot + dropped privileges + cgroup v2)
- ✅ **N**: Nautilus TEE attestation tier **live on testnet and mainnet**; reproducible enclave, on-chain PCR registration, offline-verifiable, strictly additive
- ✅ **O**: **live on Sui mainnet** (package published + upgraded to add attestation); measured per-checkpoint cost benchmarked

**Reeg is live on Sui mainnet.** Mainnet package
`0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e` (upgraded from the
original `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3` to add the
attestation module). Testnet package
`0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`. CI is green on all
three jobs (TypeScript build/lint/test, Rust fmt/clippy/test, Move build/test).

**Measured mainnet cost:** ~0.0099 SUI + ~0.0119 WAL per create + encrypted checkpoint
(1 epoch, including the Walrus upload-relay tip). Package publish ~0.047 SUI; the
attestation upgrade ~0.05 SUI.

**One honest constraint on mainnet:** a Seal-encrypted checkpoint *decrypt* (restore) needs
a working mainnet Seal key server, and mainnet has no free public Open-mode key server yet
(the decentralized committee server is "available soon"; the Ruby Nodes free-tier key
currently returns 403 from their gateway, a provider-side activation matter, not Reeg's
code). On mainnet, **encryption + storage + anchor + offline verify all work today**; only
decrypt waits on a provider key server. The full encrypted checkpoint → restore → verify
loop is proven on **testnet**.

## How to read this

- **Order is dependency order, easy to hard.** A phase assumes the ones before it.
  The riskiest engineering work (the snapshot engine, phase B) is pulled early on
  purpose, to de-risk the hardest part first.
- **Done bars are acceptance tests**, not aspirations. If the bar is not met, the
  phase is not done; we narrow scope rather than weaken the bar (especially the
  verification and reproducibility bars).
- **References:** FR/NFR ids are in
  [requirements-analysis.md](../01-product/requirements-analysis.md); the claims C1
  (owned), C2 (shareable), C3 (portable), C4 (provable) are in
  [AGENTS.md](../ai/AGENTS.md); the repo layout is in
  [repo-structure.md](repo-structure.md); platform facts are in
  [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).
- **The one invariant that overrides every phase:** nothing about verifying a past run
  may ever require a live or honest Reeg service (NFR-1). Any phase that would break it
  is wrong, no matter what it adds.

## The four pillars

Every phase below serves one of four pillars, and the headline demo proves all four at once:

- **OWN**: a Machine is an **owned** Sui object on the fast path. `create` / `retire`. The
  owner alone mutates it.
- **SHARE**: checkpoints are Seal-encrypted client-side *before they ever touch Walrus*. A
  shared `AccessPolicy` object holds grants; `grant` / `revoke` (allowlist + time-limited
  expiry) append GRANT/REVOKE entries to the provenance chain. The committee t-of-n Seal
  threshold is set at **encryption time** (`reeg checkpoint --threshold t`); revocation is
  forward-looking (it cannot un-see already-decrypted data).
- **MOVE**: `fork` a Machine from any checkpoint with provable on-chain lineage to the
  parent; `restore` a checkpoint on **any** host byte-identically (content-addressed +
  deterministic). Cross-host portability.
- **PROVE**: a hash-chained, append-only, tamper-evident provenance head on the Machine
  object, verified **offline** from public Sui + Walrus alone, plus the optional **Nautilus
  TEE attestation tier** (phase N) that proves *which code* produced a checkpoint.

## The sacred path through the phases

The single demo that proves the thesis runs through phases B, C, E, F, H, and J: run
an agent, checkpoint it, kill the host, restore on another, and have an outsider verify
the whole run with the Reeg backend stopped. Every phase either builds part of that
path or hardens and widens it. Keep that sequence working end to end as early as
possible, then deepen.

---

## Phase A - Repository and toolchain foundation

**Status: ✅ done**: monorepo, pinned toolchains, config-per-network, frozen manifest spec.

Goal: a monorepo where the on-chain package, the Rust engine, the TypeScript client,
and the Console move together, with versions pinned and networks switchable by config.

Produces:

- The monorepo skeleton from [repo-structure.md](repo-structure.md): `move/`, `engine/`
  (Rust), `packages/` (TypeScript), `apps/`, `config/`, `test/`, `scripts/`. Monorepo is
  pnpm 10 + Turborepo with Biome lint/format; the engine is Rust 1.95.
- Pinned toolchains and pinned platform versions (`@mysten/sui` 2.17,
  `@mysten/walrus` 1.1.7, `@mysten/seal` 1.1.3, `@mysten/dapp-kit`, `bcs`, plus the Rust
  and Sui/Move toolchains: Sui CLI 1.73.1, Walrus CLI), recorded as configuration, not
  hardcoded constants. All `@mysten` SDK versions are at npm latest.
- Config-per-network for testnet and mainnet (RPC, aggregator/publisher, Seal key
  server ids) so the two differ only by config.
- CI that builds every workspace, lints, and runs the Move and unit test harnesses.
- **The frozen manifest/artifact-boundary spec**: the exact manifest format and the
  content-addressed file contract between the Rust engine and the TypeScript client.
  The engineering review flagged this as the first thing to lock, because everything
  else is built against it. The Rust engine and TS client meet at **one** artifact
  boundary (a manifest + content-addressed files); the engine never imports a chain or
  storage client.

Done when: a clean checkout builds all workspaces and passes CI, the same code targets
testnet or mainnet by changing only `config/`, and the manifest spec is written down and
referenced by both the engine and the client.

Advances: foundations for everything; no FR yet.

---

## Phase B - Snapshot engine core (single host, no chain)

**Status: ✅ done**: BLAKE3 CAS, Merkle capture, deterministic manifest, restore + drift.

Goal: prove the gating risk first. Checkpoint and restore an environment on one host,
byte-identically, with no chain, storage, or encryption involved yet.

Produces:

- A content-addressed store (CAS) keyed by BLAKE3 (put/get by hash, dedup). Rust crates:
  `snapshot` / `runtime` / `cli`.
- Filesystem capture as a Merkle tree over the working directory, with the working-dir
  root hash recorded. Captures the working directory plus an optional agent memory dir
  (the `memory_pointer` round-trips).
- The manifest builder: installed packages, env vars (secrets redacted or referenced,
  never inlined), tool list, memory pointer, working-dir root hash.
- Canonical, deterministic serialization so the same input always yields the same
  `manifest_hash`, with the known non-determinism sources neutralized (file and archive
  timestamps, uid/gid, iteration order, clock, library versions). A **canonical umask is
  pinned** so captured file modes do not leak the ambient login umask: the basis for
  byte-identical restore across hosts *and* runtime tiers.
- Restore that rebuilds the working directory from the store and the manifest, plus a
  drift report that names any difference rather than hiding it.
- A reproducibility harness that runs capture/restore repeatedly and asserts stability.

Done when: on a single host, checkpoint then restore produces a byte-identical working
directory with zero drift on the supported agent pattern, and the same input yields the
same `manifest_hash` every time.

Advances: C3 (portable) foundation, FR-3, FR-4, NFR-8.

---

## Phase C - Runtime adapter and isolation tier 1

**Status: ✅ done**: one `Runtime` trait, LocalRuntime + OCI/runc tier; identical capture+verify path across tiers.

Goal: give an agent a real place to work, behind one interface, with a swappable
isolation tier, and wire the snapshot engine to live state.

Produces:

- The `Runtime` trait: `exec` plus a filesystem surface the agent uses. The **same**
  capture + verify path runs across every tier that implements it.
- `LocalRuntime` (dev, no isolation) and the **OCI container tier** (runc, read-only
  rootfs, per-session tmpfs `/work`, network isolation proven by an unreachable metadata
  service); the snapshot engine reads the writable upper layer as the live delta.
- Command and event-log capture (the input to provenance `Command` events later).

Done when: an agent runs commands and reads/writes files inside a Machine through the
adapter, and a checkpoint taken mid-session restores to a byte-identical workdir
(extending phase B onto the live runtime).

Advances: C2/C3 foundation, FR-1, FR-2.

---

## Phase D - On-chain Machine and provenance (Move)

**Status: ✅ done**: `Machine` + hash-chained provenance + `seal_approve`, live on testnet and mainnet.

Goal: the ownership and tamper-evident-record layer, on Sui, in Move 2024.

Produces:

- The `Machine` object (owner, current_blob_id, manifest_hash, provenance_head,
  checkpoint_count, parent, policy_id, created_at_epoch), owned by an address so it takes
  the fast path. Shapes match [data-model.md](../02-architecture/data-model.md).
- Entry functions: create, register-checkpoint, fork (records the parent pointer).
- The hash-chained provenance log: entry struct, append, and advance-head, so the whole
  history is verifiable against a single on-chain field.
- The owner-only `seal_approve` policy module: name starts with `seal_approve`, takes
  `id: vector<u8>` first, non-public entry, aborts to deny, side-effect free.
- Move unit tests, the most thorough in the suite because this is security-critical, plus
  a layout-compatibility test from day one so upgrades stay safe.

Done when: Move tests pass for create, fork, provenance append and head advance, and the
owner-only policy (approve owner, deny non-owner); a struct-layout change is caught by the
compatibility test before it can ship.

Advances: C1 (owned), C4 foundation, FR-1, FR-5, FR-7, FR-10.

---

## Phase E - Client adapters: chain, storage, crypto (TypeScript)

**Status: ✅ done**: chain/storage/crypto adapters; checkpoint is one atomic PTB.

Goal: connect the engine to Sui, Walrus, and Seal, and make a checkpoint a single atomic
on-chain action.

Produces:

- `chain`: read a Machine, and build the one PTB that registers the blob, appends the
  provenance entry, and advances the head atomically.
- `storage`: the Walrus adapter using the WalrusFile API and resumable uploads, with
  epoch/lifecycle awareness.
- `crypto`: the Seal adapter that encrypts client-side before upload (owner-only policy
  to start), with backup-key handling for disaster recovery.
- The full flow wired end to end: snapshot, encrypt, store, anchor.

Done when: a checkpoint taken from the client produces a Walrus `blob_id`, the Sui Machine
object advances its `provenance_head` and pins the new `blob_id` and `manifest_hash` in one
transaction, and the stored blob is ciphertext.

Advances: C1, C3, FR-3, FR-4, NFR-4, NFR-5.

---

## Phase F - Verification path (the soul)

**Status: ✅ done**: independent verifier (`@reeg/verify`) with negative tests; passes offline.

Goal: an outsider can verify a run reading only public Sui and Walrus data, with Reeg
offline. This is the product's reason to exist.

Produces:

- An independent verifier (`@reeg/verify`) that, given a Machine id, re-walks the
  provenance chain to `provenance_head`, checks each `blob_id` equals the content hash of
  the stored ciphertext, and checks `manifest_hash` and the working-dir Merkle root, all
  from public data.
- A `verify` path exposed from the CLI.
- Negative tests as first-class: a tampered blob, a forged provenance entry, and a
  wrong-host restore with no matching on-chain record all fail verification.

Done when: verification passes on a good run and fails on every tampered case, **with the
Reeg backend stopped**. No verification step reads anything but Sui and Walrus.

Advances: C4 (provable), FR-8, NFR-1, NFR-5.

---

## Phase G - CLI and public SDK

**Status: ✅ done**: `reeg` CLI + public SDK drive the full loop; the TS CLI shells to a Rust engine binary.

Goal: the operator-facing surface, so a person (and a script) can drive the whole loop.

Produces:

- The `reeg` CLI: `create`, `run`, `checkpoint` (`--epochs`, `--threshold`, `--attest
  --enclave-config`), `restore`, `fork`, `grant`, `revoke`, `retire`, `verify`,
  `evidence`, `audit`, `enclave register`. The TypeScript CLI shells to a Rust engine
  binary (`reeg-engine`) for snapshot/restore and (on the Nitro host) the enclave vsock
  client.
- The public TypeScript SDK mirroring those operations, living where the agent ecosystem
  lives.
- End-to-end exercises of the loop against testnet.

Done when: a user runs the full create/run/checkpoint/restore/fork/verify loop from the
CLI against testnet, and the same operations are callable from the SDK.

Advances: C1, C2, C3, C4 made usable, FR-1 through FR-5, FR-8.

---

## Phase H - Console (Walrus Site) and indexer

**Status: ✅ done**: rebuildable indexer + Console (Landing/Home/Detail/Preview) with offline Verify.

Goal: the web presentation, as a static Walrus Site with no privileged backend, plus a
display-only indexer that is never on the trust path. The Console is React 19 + Vite 8,
deployed as a static Walrus Site.

Produces:

- An indexer that is fully rebuildable from chain events and is used only for display, so
  nothing critical depends on its database being authoritative.
- The Console as a static Walrus Site: environments list, environment detail with the
  provenance timeline, snapshot/restore/fork/share flows, and a Verify button that runs
  client-side and works with Reeg offline.
- The design standard from [the design brief](../06-design/design-brief.md): blockchain
  language hidden, the empty/loading/error/success states designed (not skipped), and the
  Verified badge that reads as reassurance, not a crypto seal.

Done when: an outsider opens a shared environment in the Console and the Verify button
returns a clear pass on a good run **with the Reeg backend stopped**, and a tampered run
shows a clear fail.

Advances: C4 presented, FR-13, FR-14, FR-15, FR-16, FR-17, NFR-1.

---

## Phase I - Sharing and access depth

**Status: ✅ done**: owner-only, allowlist (`seal_approve_allowlist`), time-lock (`seal_approve_until`), and committee t-of-n all shipped.

Goal: real sharing, from owner-only to allowlist to higher-assurance committee policies.

Produces:

- Allowlist grant and revoke end to end (`seal_approve_allowlist`), with the Console UI
  to add and remove people by name, not address. GRANT/REVOKE entries append to the
  provenance chain.
- Committee / threshold (t-of-n) Seal policies for higher-assurance sharing. The
  committee threshold `t` is **pinned at encryption time** via `reeg checkpoint
  --threshold t`, so the decrypt assurance is fixed when the ciphertext is written.
- Time-limited grants (`seal_approve_until`) for collaborators.

Done when: a grantee can decrypt and restore after a grant and fails on the next attempt
after a revoke; a committee-gated Machine requires the threshold set to decrypt; a
time-limited grant stops working after its window. Revocation is correctly forward-looking
(it cannot un-see already-decrypted data).

Advances: C2 (shareable) deepened, FR-11, FR-12, FR-16.

---

## Phase J - Cross-host portability hardening

**Status: ✅ done**: `test/live/acceptance.ts` runs the scripted kill-host → restore-elsewhere →
verify-offline → grant → revoke demo end to end.

Goal: make the kill-and-restore-elsewhere story robust, not just demoable once.

Produces:

- The kill-host then restore-on-a-fresh-host flow, on a host that never saw the original.
- Reproducibility across heterogeneous hosts **and runtime tiers**: pinned libraries, the
  canonical umask, and a standardized restore environment so a restore on a different
  machine (or a different tier) still matches the recorded hashes.
- The full acceptance demo scripted and rehearsed until it is boring: run, checkpoint,
  kill, restore, verify-with-backend-down, grant, revoke.

Done when: a run checkpointed on host A restores on a clean host B with the working
directory matching the recorded hashes, and the scripted acceptance demo passes cleanly
end to end. This is the product's headline acceptance bar (C1 through C4 together).

Advances: C3 (portable) hardened, FR-4, NFR-2, NFR-8.

---

## Phase K - Agent memory (MemWal)

**Status: 🟡 partial**: the backend-agnostic seam exists (`REEG_MEMORY_DIR`, `memory_pointer` in the
manifest, captured/verified with the workdir); wiring MemWal as an optional backend remains.

Goal: memory that is owned, checkpointed, and verified with the rest of the environment.

Produces:

- MemWal wired as one optional memory backend behind the `REEG_MEMORY_DIR` seam, as a
  single runtime call behind the runtime adapter.
- The `memory_pointer` carried inside the checkpointed manifest, so memory is captured,
  restored, and verified alongside the filesystem and environment.

Done when: an agent's memory written through MemWal survives a checkpoint and restore on a
different host and verifies as part of the run; if MemWal is unavailable, the filesystem
and environment story still stands.

Advances: FR-18, deepens C3 and C4.

---

## Phase L - Compliance and evidence layer (elevated)

**Status: ✅ done**: `reeg evidence` exports a portable record; `reeg audit` re-verifies it offline.

Goal: turn the record we already produce into evidence a regulated buyer can keep and
present. Elevated because compliance is the one concrete, budgeted demand: Reeg's
tamper-evident provenance and evidence export map to the EU AI Act Article 12
record-keeping duties for high-risk AI. Reuses existing provenance and verification
primitives; adds no new trusted party. (Positioning, not legal advice: Reeg does not
make anyone compliant; claims stay honest.)

Produces:

- Evidence export for auditors: a portable manifest with the Machine id, per-checkpoint
  `blob_id`s and `manifest_hash`es, the provenance entries and their `entry_hash` chain,
  and a command-log digest, valid outside both Reeg and the Console.
- Retention controls: keeping blobs paid through the required Walrus storage window
  (`--epochs`; ~6 months ≈ 13 testnet epochs), with the permanent on-chain provenance
  head, mapped to the minimum-retention duty.
- Optional signed result attestations on `Command` events.
- Honest cost surfacing (WAL plus Sui gas) in the UI, so the buyer sees the real number.

Done when: an auditor verifies a run from an exported evidence file alone, with no Reeg
service and no Console, and the retention window for a Machine is configurable and visible.
See [system-architecture.md](../02-architecture/system-architecture.md) section 6.

Advances: C4 turned into evidence, FR-9, NFR-1, NFR-7.

---

## Phase M - Production isolation tier (Firecracker microVM)

**Status: ✅ done (19/19), hardened and verified on real AWS KVM, including #14 jailer**: the microVM +
OCI/runc + in-guest agent tiers merged in PR #1 (`14ae8c7`) with 19 logged defects and had never run on
real hardware. They were stood up on an AWS KVM host (`c8i.2xlarge`), which first surfaced a 20th defect
(the umask determinism leak, now fixed), then took a full hardening pass: in-process tar extraction
(symlink/traversal-safe), real VM Drop-reaping, RAII partial-init cleanup, read-only rootfs + per-VM
tmpfs `/work` (cross-tenant isolation), u64 framing with allocation caps, OCI network/ipc/uts
namespaces with all caps dropped, a seccomp denylist (incl. `io_uring`/`userfaultfd`/`AF_NETLINK`)
and masked paths, and per-session path uniquification. The applied diff was then adversarially re-reviewed and its
findings closed. **#14 is now closed:** the Firecracker VMM runs under the **jailer** (chroot, privileges
dropped to an unprivileged uid/gid, and a cgroup v2 placement) on top of the microVM kernel boundary
that remains the primary defense. **Verified on KVM:** lib unit 11/11, `firecracker_session` 8/8 plus a
sudo-gated jailer test, `oci_session` 3/3, clippy `-D warnings` clean, no leaked VMs, including tests
proving traversal/symlink rejection, per-session isolation, read-only rootfs, and the EC2 metadata
service being unreachable. Closure detail and ops steps are in the
[AWS Firecracker runbook](aws-firecracker-runbook.md).

Goal: hard multi-tenant isolation for running untrusted agent code at volume, behind the
same runtime adapter, without touching the verification path.

Produces:

- A Firecracker microVM runtime implementing the same `Runtime` trait as the container
  tier, with KVM kernel-boundary isolation, a per-session tmpfs, a read-only rootfs, and
  an in-guest agent reached over **vsock** with a length-prefixed framed protocol.
- The jailer wrapper (#14): chroot + dropped privileges to an unprivileged uid/gid +
  cgroup v2, operational hardening on top of the VM boundary.
- The operational layer: KVM-capable hosts and the scaling story for them (the AWS KVM
  host runbook).

Done when: the full loop (run, checkpoint, restore, verify) passes on the microVM tier
exactly as on the container tier, with no change to the verification path, and untrusted
code is isolated at the VM boundary.

Advances: hardens C1 through C4 for real multi-tenant use; T-I4 in
[security-and-threat-model.md](../02-architecture/security-and-threat-model.md).

---

## Phase N - Verifiable compute (Nautilus attestation)

**Status: ✅ done, live on testnet AND mainnet this session**: the optional TEE attestation tier that
proves *which code* produced a checkpoint. Live `EnclaveConfig`s verified offline 4/4 on both networks.

Goal: for the runs that need it, prove what code ran, not just the environment. Optional
tier; the enclave **attests results, it does not run the agent** (the agent stays in the
Firecracker VM, preserving portability and offline verify).

Produces:

- A tiny **reproducible** AWS Nitro enclave (musl-static, ~6.5 MB `.eif`; two cache-cleared
  rebuilds produce **identical PCRs**) that derives an ed25519 key from NSM entropy, obtains
  a Nitro attestation document embedding that key, and signs a checkpoint's manifest hash
  over a **frozen preimage**.
- On chain: `register_enclave` verifies the Nitro document via `0x2::nitro_attestation` and
  pins the PCRs + ed25519 key into a shared `EnclaveConfig` (once per build);
  `register_attested_command` cheaply ed25519-verifies each per-checkpoint signature and
  emits `CommandAttested`.
- An offline verifier (`@reeg/verify`) that confirms the signature and that the PCRs match
  the trusted reproducible build (it flags all-zero debug-mode PCRs).

Done when: a run can carry a PCR-bound attestation in its provenance that a verifier checks
on-chain, deepening the proof from "this environment and history are authentic" to "this
exact code ran on this input." **Strictly additive:** zero changes to `machine.move`'s
layout or provenance head, so a non-attested run is byte-identical and the core loop still
works for every run that does not use it. `reeg checkpoint --attest` runs **on** the AWS
Nitro host (the engine reaches the local enclave over vsock, with the operator's key on
that host).

Advances: extends C4 to execution; deepens phase L evidence for high-risk runs.

---

## Phase O - Mainnet, lifecycle, and scale

**Status: ✅ done, live on Sui mainnet**: package published and upgraded to add attestation; the
encrypted create + checkpoint loop is exercised on mainnet with a measured cost benchmark.

Goal: run as a real service, manage cost over time, and support teams at volume.

Produces:

- **Mainnet deployment** of the Machine package and policies. Live package
  `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e` (upgraded from
  `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3` to add attestation),
  reached from the same code by config switch; the same tests run against mainnet config.
- Retire and storage-lifecycle controls (FR-6) so operators manage checkpoint cost over
  time while meeting retention duties.
- Team accounts: multiple operators per Machine and role-based grants.
- A **per-checkpoint cost benchmark** on a realistic run: **~0.0099 SUI + ~0.0119 WAL** per
  create + encrypted checkpoint (1 epoch, incl. the Walrus upload-relay tip); publish
  ~0.047 SUI; the attestation upgrade ~0.05 SUI.
- Integrations that wrap the agent frameworks and sandbox runtimes teams already use, so
  Reeg fits existing workflows rather than replacing them.

Done when: an external team runs their own agents on mainnet, shares and restores
environments, a third party verifies them, retention and cost are managed and visible, and
the per-checkpoint cost is within the benchmarked budget.

**Honest mainnet constraint:** encryption + storage + anchor + **offline verify all work on
mainnet today**; only *decrypt* (restore) of a Seal-encrypted checkpoint waits on a working
mainnet Seal key server. Mainnet has no free public Open-mode key server yet (the
decentralized committee server is "available soon"; independent providers run Permissioned
mode requiring signup; the Ruby Nodes free-tier key currently returns 403 from their
gateway, a provider-side activation matter, not Reeg's code). The full encrypted
checkpoint → restore → verify loop is proven on **testnet**.

Advances: FR-6, NFR-6, NFR-7, NFR-9; the full product at scale.

---

## Mapping to the product roadmap

As of 2026-06-11, **Reeg is live on Sui mainnet** and the full own/share/move/prove loop ships.

- **Done (A–J, L, M, N, O):** the full own/share/fork/move/prove loop, evidence export, the
  hardened Firecracker tier (M, **19/19** incl. the jailer), the Nautilus attestation tier
  (N, live on testnet and mainnet), and the mainnet publish/upgrade with a measured
  per-checkpoint cost benchmark (O). Sharing depth (I), owner-only, allowlist, time-lock,
  and committee t-of-n, is shipped.
- **Remaining (K):** wiring MemWal as an optional backend behind the `REEG_MEMORY_DIR`
  seam; the backend-agnostic memory seam already round-trips through capture and verify.
- **Out of scope (non-goals):** live sub-second mirroring, a regulated-data vault, our own
  agent framework (see [roadmap.md](../01-product/roadmap.md)).

The one honest open item is not code: a **working mainnet Seal key server** for *decrypt*
(restore) of encrypted checkpoints. On mainnet, encryption + storage + anchor + offline
verify already work; the full encrypted restore loop is proven on testnet.

**Tests / CI (verified this session):** Move 40/40 (incl. attestation with a real ed25519
vector); `@reeg/verify` 54/54; `@reeg/chain` 21/21; `@reeg/crypto` 8/8 (cross-language
preimage match against the Move vector); engine Firecracker 8/8 + jailer + OCI 3/3 + lib
11/11 on KVM. CI is green on all three jobs (TypeScript, Rust, Move).

## Risk gates carried from feasibility

Three early risk gates sat between phases and have all been cleared:

- After phase B: confirm restore is reproducible enough that verify is meaningful. **Cleared:**
  byte-identical restore holds across hosts and runtime tiers (the canonical umask
  closed the last cross-tier leak).
- Before mainnet (phase O): confirm per-checkpoint cost is acceptable on a realistic run and
  that Walrus storage epochs are managed. **Cleared:** measured ~0.0099 SUI + ~0.0119 WAL
  per create + encrypted checkpoint, with `--epochs` retention control.
- Before leaning on a newer tier (committee Seal, MemWal, Nautilus): confirm its current
  status against [sui-tech-reference.md](../02-architecture/sui-tech-reference.md) and keep
  the core loop independent of it. **Held:** Nautilus and committee Seal are strictly
  additive; a non-attested, owner-only run is byte-identical and the core loop never depends
  on them.
