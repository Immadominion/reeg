# Engineering Build Roadmap

This is the build sequence, not the product timeline. The product
[roadmap.md](../01-product/roadmap.md) says what ships and when, anchored to the
Overflow window; this document says how we build it, phase by phase, in dependency
order from the easiest, most certain work to the hardest. It contains no code. It is
the standard we will not build below: each phase names a goal, what it produces, the
**done bar** that says it is finished, and the requirements and claims it advances.

We are building the whole product, not an MVP and not a scripted demo. Phases late in
this list are real features real users will want, sequenced after the ones they depend
on, never deferred because the product is incomplete without them.

## How to read this

- **Order is dependency order, easy to hard.** A phase assumes the ones before it.
  The riskiest engineering work (the snapshot engine, phase B) is pulled early on
  purpose, matching the de-risking sequence in
  [technical-feasibility-study.md](../04-feasibility/technical-feasibility-study.md).
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

## The sacred path through the phases

The single demo that proves the thesis runs through phases B, C, E, F, H, and J: run
an agent, checkpoint it, kill the host, restore on another, and have an outsider verify
the whole run with the Reeg backend stopped. Every phase either builds part of that
path or hardens and widens it. Keep that sequence working end to end as early as
possible, then deepen.

---

## Phase A - Repository and toolchain foundation

Goal: a monorepo where the on-chain package, the Rust engine, the TypeScript client,
and the Console move together, with versions pinned and networks switchable by config.

Produces:

- The monorepo skeleton from [repo-structure.md](repo-structure.md): `move/`, `engine/`
  (Rust), `packages/` (TypeScript), `apps/`, `config/`, `test/`, `scripts/`.
- Pinned toolchains and pinned platform versions (`@mysten/sui` ~2.17.0,
  `@mysten/walrus` ~1.1.7, `@mysten/seal` ~1.1.3, the Rust and Sui/Move toolchains),
  recorded as configuration, not hardcoded constants.
- Config-per-network for testnet and mainnet (RPC, aggregator/publisher, Seal key
  server ids) so the two differ only by config.
- CI that builds every workspace, lints, and runs the Move and unit test harnesses.
- **The frozen manifest/artifact-boundary spec**: the exact manifest format and the
  content-addressed file contract between the Rust engine and the TypeScript client.
  The engineering review flagged this as the first thing to lock, because everything
  else is built against it.

Done when: a clean checkout builds all workspaces and passes CI, the same code targets
testnet or mainnet by changing only `config/`, and the manifest spec is written down and
referenced by both the engine and the client.

Advances: foundations for everything; no FR yet.

---

## Phase B - Snapshot engine core (single host, no chain)

Goal: prove the gating risk first. Checkpoint and restore an environment on one host,
byte-identically, with no chain, storage, or encryption involved yet.

Produces:

- A content-addressed store keyed by BLAKE3 (put/get by hash, dedup).
- Filesystem capture as a Merkle tree over the working directory, with the working-dir
  root hash recorded.
- The manifest builder: installed packages, env vars (secrets redacted or referenced,
  never inlined), tool list, memory pointer, working-dir root hash.
- Canonical, deterministic serialization so the same input always yields the same
  `manifest_hash`, with the known non-determinism sources neutralized (file and archive
  timestamps, uid/gid, iteration order, clock, library versions).
- Restore that rebuilds the working directory from the store and the manifest, plus a
  drift report that names any difference rather than hiding it.
- A reproducibility harness that runs capture/restore repeatedly and asserts stability.

Done when: on a single host, checkpoint then restore produces a byte-identical working
directory with zero drift on the supported agent pattern, and the same input yields the
same `manifest_hash` every time.

Advances: C3 (portable) foundation, FR-3, FR-4, NFR-8.

---

## Phase C - Runtime adapter and isolation tier 1

Goal: give an agent a real place to work, behind one interface, with a swappable
isolation tier, and wire the snapshot engine to live state.

Produces:

- The `runtime` adapter interface: `exec` plus a filesystem surface the agent uses.
- Tier 1 implementation: OCI container with OverlayFS, a read-only lower layer
  (composefs/EROFS) and a writable upper layer; the snapshot engine reads the upper
  layer as the live delta. fs-verity on read-only layers where the kernel supports it.
- Command and event-log capture (the input to provenance `Command` events later).

Done when: an agent runs commands and reads/writes files inside a Machine through the
adapter, and a checkpoint taken mid-session restores to a byte-identical workdir
(extending phase B onto the live runtime).

Advances: C2/C3 foundation, FR-1, FR-2.

---

## Phase D - On-chain Machine and provenance (Move)

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

Goal: an outsider can verify a run reading only public Sui and Walrus data, with Reeg
offline. This is the product's reason to exist.

Produces:

- An independent verifier (a library) that, given a Machine id, re-walks the provenance
  chain to `provenance_head`, checks each `blob_id` equals the content hash of the stored
  ciphertext, and checks `manifest_hash` and the working-dir Merkle root, all from public
  data.
- A `verify` path exposed from the CLI.
- Negative tests as first-class: a tampered blob, a forged provenance entry, and a
  wrong-host restore with no matching on-chain record all fail verification.

Done when: verification passes on a good run and fails on every tampered case, **with the
Reeg backend stopped**. No verification step reads anything but Sui and Walrus.

Advances: C4 (provable), FR-8, NFR-1, NFR-5.

---

## Phase G - CLI and public SDK

Goal: the operator-facing surface, so a person (and a script) can drive the whole loop.

Produces:

- The `reeg` CLI: create, run, checkpoint, restore, fork, verify, and grant/revoke.
- The public TypeScript SDK mirroring those operations, living where the agent ecosystem
  lives.
- End-to-end exercises of the loop against testnet.

Done when: a user runs the full create/run/checkpoint/restore/fork/verify loop from the
CLI against testnet, and the same operations are callable from the SDK.

Advances: C1, C2, C3, C4 made usable, FR-1 through FR-5, FR-8.

---

## Phase H - Console (Walrus Site) and indexer

Goal: the web presentation, as a static Walrus Site with no privileged backend, plus a
display-only indexer that is never on the trust path.

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

Goal: real sharing, from owner-only to allowlist to higher-assurance committee policies.

Produces:

- Allowlist grant and revoke end to end (`seal_approve_allowlist`), with the Console UI
  to add and remove people by name, not address.
- Committee / threshold (t-of-n) Seal policies for higher-assurance sharing, now that
  committee mode is GA.
- Time-limited grants (`seal_approve_until`) for collaborators.

Done when: a grantee can decrypt and restore after a grant and fails on the next attempt
after a revoke; a committee-gated Machine requires the threshold set to decrypt; a
time-limited grant stops working after its window. Revocation is correctly forward-looking.

Advances: C2 (shareable) deepened, FR-11, FR-12, FR-16.

---

## Phase J - Cross-host portability hardening

Goal: make the kill-and-restore-elsewhere story robust, not just demoable once.

Produces:

- The kill-host then restore-on-a-fresh-host flow, on a host that never saw the original.
- Reproducibility across heterogeneous hosts: pinned libraries and a standardized restore
  environment so a restore on a different machine still matches the recorded hashes.
- The full acceptance demo scripted and rehearsed until it is boring: run, checkpoint,
  kill, restore, verify-with-backend-down, grant, revoke.

Done when: a run checkpointed on host A restores on a clean host B with the working
directory matching the recorded hashes, and the scripted acceptance demo passes cleanly
end to end. This is the product's headline acceptance bar (C1 through C4 together).

Advances: C3 (portable) hardened, FR-4, NFR-2, NFR-8.

---

## Phase K - Agent memory (MemWal)

Goal: memory that is owned, checkpointed, and verified with the rest of the environment.

Produces:

- Integration of the shipped MemWal public-beta SDK as one runtime call, behind the
  runtime adapter.
- The `memory_pointer` carried inside the checkpointed manifest, so memory is captured,
  restored, and verified alongside the filesystem and environment.

Done when: an agent's memory written through MemWal survives a checkpoint and restore on a
different host and verifies as part of the run; if MemWal is unavailable, the filesystem
and environment story still stands.

Advances: FR-18, deepens C3 and C4.

---

## Phase L - Compliance and evidence layer (elevated)

Goal: turn the record we already produce into evidence a regulated buyer can keep and
present. Elevated because compliance is the one concrete, budgeted demand (EU AI Act
Article 12, applying 2 August 2026). Reuses existing provenance and verification
primitives; adds no new trusted party.

Produces:

- Evidence export for auditors: a portable manifest with the Machine id, per-checkpoint
  `blob_id`s and `manifest_hash`es, the provenance entries and their `entry_hash` chain,
  and a command-log digest, valid outside both Reeg and the Console.
- Retention controls: keeping blobs paid through the required Walrus storage window, with
  the permanent on-chain provenance head, mapped to the minimum-retention duty.
- Optional signed result attestations on `Command` events.
- Honest cost surfacing (WAL plus Sui gas) in the UI, so the buyer sees the real number.

Done when: an auditor verifies a run from an exported evidence file alone, with no Reeg
service and no Console, and the retention window for a Machine is configurable and visible.
See [system-architecture.md](../02-architecture/system-architecture.md) section 6.

Advances: C4 turned into evidence, FR-9, NFR-1, NFR-7.

---

## Phase M - Production isolation tier (Firecracker microVM)

Goal: hard multi-tenant isolation for running untrusted agent code at volume, behind the
same runtime adapter, without touching the verification path.

Produces:

- A Firecracker microVM runtime implementing the same adapter interface as the container
  tier, with a per-session kernel.
- microVM snapshot integration aligned with the content-addressed snapshot engine.
- The operational layer: KVM-capable hosts and the scaling story for them.

Done when: the full loop (run, checkpoint, restore, verify) passes on the microVM tier
exactly as on the container tier, with no change to the verification path, and untrusted
code is isolated at the VM boundary.

Advances: hardens C1 through C4 for real multi-tenant use; T-I4 in
[security-and-threat-model.md](../02-architecture/security-and-threat-model.md).

---

## Phase N - Verifiable compute (Nautilus, mainnet)

Goal: for the runs that need it, prove what code ran, not just the environment. Optional
tier, sequenced here by scope; Nautilus is on mainnet, so this is no longer testnet upside.

Produces:

- Optional TEE-attested execution via Nautilus (AWS Nitro Enclaves or Marlin Oyster).
- On-chain PCR registration of the enclave, and enclave-signed result attestations
  attached to the relevant `Command` provenance events.
- Reproducible enclave builds so anyone can rebuild the binary and confirm the PCRs.

Done when: a run can carry a PCR-bound attestation in its provenance that a verifier checks
on-chain, deepening the proof from "this environment and history are authentic" to "this
exact code ran on this input." The core loop still works for every run that does not use it.

Advances: extends C4 to execution; deepens phase L evidence for high-risk runs.

---

## Phase O - Mainnet, lifecycle, and scale

Goal: run as a real service, manage cost over time, and support teams at volume.

Produces:

- Mainnet deployment of the Machine package and policies, by config switch only, with the
  same tests re-run against mainnet config before cutover.
- Retire and storage-lifecycle controls (FR-6) so operators manage checkpoint cost over
  time while meeting retention duties.
- Team accounts: multiple operators per Machine and role-based grants.
- A per-checkpoint cost benchmark gate on a realistic run before relying on mainnet, so
  pricing reflects real WAL and gas cost.
- Integrations that wrap the agent frameworks and sandbox runtimes teams already use, so
  Reeg fits existing workflows rather than replacing them.

Done when: an external team runs their own agents on mainnet, shares and restores
environments, a third party verifies them, retention and cost are managed and visible, and
the per-checkpoint cost is within the benchmarked budget.

Advances: FR-6, NFR-6, NFR-7, NFR-9; the full product at scale.

---

## Mapping to the product roadmap

The product [roadmap.md](../01-product/roadmap.md) groups these by ship window:

- **Phase 0 (foundations):** build phases A, B.
- **Phase 1 (the product, end to end):** build phases C, D, E, F, G, H, the owner-only and
  allowlist parts of I, and J. This is the full own/share/fork/move/prove loop.
- **Phase 2 (mainnet and daily-driver):** committee policies in I, MemWal (K), the evidence
  export in L, honest cost surfacing, and mainnet in O.
- **Phase 3 (trust and depth):** the deeper compliance and retention work in L, verifiable
  compute (N), and retire/lifecycle controls.
- **Phase 4 (scale and distribution):** the Firecracker tier (M) and the team accounts,
  integrations, and scale work in O.

## Risk gates carried from feasibility

Three gates from [technical-feasibility-study.md](../04-feasibility/technical-feasibility-study.md)
sit between phases and must be cleared before proceeding:

- After phase B: confirm restore is reproducible enough that verify is meaningful. If not,
  narrow the runtime surface until it is, before building anything on top.
- Before mainnet (phase O): confirm per-checkpoint cost is acceptable on a realistic run and
  that Walrus storage epochs are managed.
- Before leaning on a newer tier (committee Seal, MemWal, Nautilus): confirm its current
  status against [sui-tech-reference.md](../02-architecture/sui-tech-reference.md) and keep
  the core loop independent of it.
