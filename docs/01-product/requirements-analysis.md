# Requirements Analysis

Status: living document. Scope: the Overflow build (target demo June 21) plus the near-term product. Anything not needed to prove the core claim is marked Later.

Read [product-vision.md](../00-overview/product-vision.md) first for the why. Read [sui-tech-reference.md](../02-architecture/sui-tech-reference.md) for the verified platform facts behind every "how."

## 1. Problem statement, restated as requirements

An AI agent does real work in a sandbox you don't own and can't keep. Today that sandbox is rented and gone when the session ends. The operator does not own the environment, cannot share or fork it as-is, cannot move it off the vendor, and nobody outside the vendor can prove what happened inside it. The loss is the same wearing many faces: you didn't own the environment. Reeg is infrastructure for portable computing environments (not the compute, not a server, not an OS): it sits over that sandbox and must make the environment owned and shareable, portable across hosts, and provable by any outsider. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment: that is the wedge. The same requirements hold for any environment you run: a CI run, an eval or research environment, a data pipeline, or any reproducible workspace worth keeping.

Four claims must hold, and every requirement traces back to one of them. They are the four pillars: own / share / move / prove. Lead with C1 and C2 (the adoption wedge); C3 and C4 are what ownership makes possible. Stated for AI agents first, but true of any environment you run:

- C1 Owned: the operator controls the environment and who can read or run it, not Reeg. The environment is an object you hold, not a row you rent.
- C2 Shareable: a whole environment can be handed to a teammate or forked from a checkpoint, because it is owned data, not a vendor row.
- C3 Portable: a run can be checkpointed and restored byte-identically on a different host.
- C4 Provable: an outsider can verify what happened with the Reeg server offline. It comes for free from C1, and it is the lead differentiator, the tamper-proof history GitHub and vendor logs cannot give you. Git history can be rewritten and this cannot.

## 2. Functional requirements

Priority key: P0 must ship for the demo, P1 strong follow-on, P2 later.

### Machine lifecycle

- FR-1 (P0) Create a Machine: provision an isolated environment (filesystem + command execution) bound to an on-chain Machine object owned by the operator's address. See [data-model.md](../02-architecture/data-model.md).
- FR-2 (P0) Run an agent inside the Machine: execute commands and read/write files through the Reeg runtime.
- FR-3 (P0) Checkpoint: capture the Machine state into a content-addressed snapshot, encrypt it client-side with Seal, store it on Walrus, and anchor the reference on the Sui Machine object.
- FR-4 (P0) Restore: rebuild a Machine on any host from a checkpoint reference read off Sui, with state verified against the on-chain record before resuming.
- FR-5 (P1) Fork: create a child Machine from any checkpoint, preserving the parent pointer in provenance.
- FR-6 (P2) Destroy/retire: stop a Machine and let its Walrus storage lapse at end_epoch, while the provenance record stays on Sui.

### Provenance and verification

- FR-7 (P0) Append-only provenance: every checkpoint appends a hash-chained entry; the Machine object stores the current `provenance_head`.
- FR-8 (P0) Independent verify: given only a Machine id, an outsider can read Sui + Walrus and confirm the checkpoint chain and state hashes without calling any Reeg service. This is the verification flow in [verification-flow.json](../02-architecture/diagrams/verification-flow.json).
- FR-9 (P1) Manifest export: emit a portable manifest (hashes, blob ids, command log digest) as a single file an auditor can keep.

### Access control

- FR-10 (P0) Owner-only by default: only the Machine owner's address can decrypt checkpoints and restore. Enforced by a Seal `seal_approve` policy, not by Reeg.
- FR-11 (P1) Grant/revoke: owner can add an allowlisted address (an auditor, a teammate) with read or restore rights, and revoke it.
- FR-12 (P2) Time-limited and committee policies: expiring grants and t-of-n approvals (committee mode is GA now; sequenced later by scope, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).

### Console (presentation)

- FR-13 (P0) Provenance timeline: a web Console shows a Machine's checkpoints in order with their on-chain anchors.
- FR-14 (P0) Verify button: runs the independent verification in the browser and shows pass/fail with the evidence.
- FR-15 (P1) Restore and fork from the Console.
- FR-16 (P1) Grant/revoke from the Console.
- FR-17 (P0) The Console is a Walrus Site with no privileged backend, so the demo has no hidden server doing the trusting.

### Memory

- FR-18 (P1) Agent memory via MemWal exposed as one runtime call, so memory writes are part of the same owned, checkpointed environment. MemWal is an official track resource (docs.memwal.ai).

## 3. Non-functional requirements

- NFR-1 Verifiability without trust (C4): verification must require zero secrets held only by Reeg. If Reeg vanished, every past run stays checkable. This is a non-negotiable guarantee, and it is now central to the pitch (the differentiator), not just an internal invariant.
- NFR-2 Portability (C3): restore must work on a clean host that never saw the original. No host-local hidden state.
- NFR-3 Honest latency: checkpoints happen on commit boundaries, not on every keystroke, because Walrus is durable storage, not a low-latency database (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)). The product must never imply real-time mirroring.
- NFR-4 Confidentiality: checkpoint contents are encrypted before they leave the client. Walrus blobs are public, so Seal encryption is mandatory, not optional. Reeg never sees plaintext keys.
- NFR-5 Integrity: any tamper with a stored blob is detectable, because `blob_id` is the content hash and the Machine object pins it.
- NFR-6 Availability: rely on Walrus durability (reads survive with 2/3 of nodes responsive). Reeg adds no single point of failure to verification.
- NFR-7 Cost transparency: storing checkpoints costs WAL + Sui gas. The product surfaces this; it does not hide it. Checkpoint granularity is a cost lever.
- NFR-8 Reproducible restore: the same checkpoint restores to a byte-identical workdir, or the difference is reported. No silent drift.
- NFR-9 Scale posture: one operator with many Machines, many checkpoints per Machine. Indexing for the Console is off-chain and rebuildable from events; nothing critical depends on it.

## 4. Constraints

- Build window: working demo by June 21; mainnet by Aug 27 triggers 100% upfront payout (track terms, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- Platform maturity: Nautilus (verifiable off-chain compute, TEE) is on mainnet now. Treat any TEE-attested compute as a P2 differentiator sequenced by scope, not a P0 dependency.
- Seal committee mode is GA now; owner-only and allowlist policies remain the dependable P0/P1 path by integration risk.
- Move has no inheritance or dynamic dispatch; design data with explicit objects and capabilities, not class hierarchies.
- Walrus is not for ultra-low-latency or tiny ephemeral state; the architecture must not push it there.

## 5. Out of scope (and why)

- Live keystroke mirroring across hosts: contradicts NFR-3. Reeg checkpoints, it does not stream.
- Regulated PHI / classified data custody: Seal explicitly is not positioned for that (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)). Reeg records and protects the app layer, it is not a compliance vault.
- A general-purpose agent framework: Reeg is the environment and the record, not the agent's brain.

## 6. Acceptance criteria for the demo

The demo passes if, live:

1. An agent runs in a Machine and produces a result (FR-1, FR-2).
2. We checkpoint, then fully kill the host (FR-3).
3. We restore on a different host and the agent resumes from the exact state (FR-4, NFR-2).
4. An auditor verifies the whole run in the Console with the Reeg server stopped (FR-8, FR-14, NFR-1).
5. Access is owner-gated and a grant to the auditor is shown and then revoked (FR-10, FR-11).

If any of 1-4 needs a running Reeg backend to be believable, the demo has failed its own thesis.
</content>
