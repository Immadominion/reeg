# AGENTS.md — AI context for Reeg

This is the single source of truth for an AI agent (or a new human) working on Reeg. Read this first. It tells you what we are building, why, the verified facts you must not contradict, and how to behave. When something here conflicts with your assumptions, this file wins. When this file conflicts with a verified platform fact, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md), which is the factual backbone.

## 1. What Reeg is, in one paragraph

Reeg is infrastructure for portable computing environments. We started with AI agents
because they're the fastest-growing source of ephemeral work, but the underlying system
can preserve and move any environment. You run the work (your agent, your container, your microVM, someone else's
cloud) and at every commit Reeg snapshots the whole working state, encrypts it
client-side, stores it as data you own on Walrus, and anchors a hash-chained,
append-only record to a Sui object only you control, so it can be shared, forked, moved
across hosts, and independently verified. It sits over the sandbox you already use; it
does not run your workload or hold your compute. Provenance is an append-only
hash-chained record on Sui; checkpoints are encrypted content-addressed blobs on
Walrus; access is enforced by on-chain Seal policies. We started with AI agents because
they're the fastest-growing source of work worth keeping, sharing, and standing behind,
but the same layer can preserve, move, and prove any environment you run.
One-liner: Your agent runs in a sandbox you don't own and can't keep. Reeg lets you own
that environment, move it byte-for-byte to any host, and prove its whole history, with
Reeg switched off. The differentiator is the part GitHub cannot match: a tamper-proof
history (GitHub history can be rewritten; this cannot) over an environment you own. Keep
Git only as a mechanic (version control for the whole environment, not just the code),
never as the handle. Reeg is the layer, not the sandbox, a server, or an OS, and not the
agent's brain. Domain reeg.xyz. Support <support@reeg.xyz>.

## 2. The claims (memorize these)

Every decision serves one of these. If a feature serves none, it waits. Lead the pitch
with the use case (snapshot and prove what your agent did): C4 (a provable, tamper-proof
history) is the differentiator GitHub and vendor logs cannot match, and C1 (owned) is
what makes it possible.

- C1 Owned: the operator controls the environment and who can read or run it, not Reeg. Enforced on-chain by a Seal `seal_approve` policy.
- C2 Shareable: a whole live environment can be handed to a teammate, forked from a checkpoint, or passed to a client as-is, because it is owned data, not a vendor row.
- C3 Portable: a run can be checkpointed and restored on a different host, byte-checked against its recorded state.
- C4 Provable: an outsider can verify what happened with the Reeg server offline, reading only public Sui + Walrus data. This is the lead differentiator (the part GitHub and vendor logs cannot give you); it comes for free because of C1.

The non-negotiable: nothing about verifying a past run may require a live or honest Reeg service. Verifiability is now a headline (the differentiator) and a hard engineering invariant. If a design breaks it, the design is wrong.

## 3. Key product terms

- Machine: an owned Sui object representing one agent environment. Carries the provenance head and latest checkpoint reference.
- Checkpoint: an encrypted, content-addressed snapshot of a Machine's state, stored on Walrus, anchored on Sui.
- Provenance: append-only, hash-chained history of a Machine; the head lives on the Machine object.
- Restore: rebuild a Machine on any host from a checkpoint, verifying state against the on-chain record before resuming.
- Fork: a child Machine created from a checkpoint, with a parent pointer in provenance.
- Verify: the offline check an outsider runs against Sui + Walrus. This is the product's soul.
- Console: a Walrus Site (static, no privileged backend) showing the provenance timeline with a Verify button.
Full list in [glossary.md](../00-overview/glossary.md).

## 4. Architecture in five lines

1. Runtime adapter wraps a sandbox (filesystem + command execution) the agent works in; isolation is a swappable tier (OCI container first, Firecracker microVM later) behind one interface.
2. Snapshot engine (the SOTA core: content-addressed BLAKE3 store, OverlayFS-upper deltas, canonical manifest) builds a manifest (content hashes + deltas), produces a `manifest_hash`.
3. Crypto adapter encrypts client-side with Seal; storage adapter puts the blob on Walrus, getting a `blob_id` (= content hash).
4. Chain client submits one PTB: register `blob_id` + `manifest_hash`, append provenance, advance the head on the Machine object.
5. Anyone reads Sui + Walrus to verify the chain and hashes, with Reeg offline.
Diagrams: [system-context.json](../02-architecture/diagrams/system-context.json), [component-architecture.json](../02-architecture/diagrams/component-architecture.json), [snapshot-restore-sequence.json](../02-architecture/diagrams/snapshot-restore-sequence.json), [verification-flow.json](../02-architecture/diagrams/verification-flow.json).

## 5. Verified platform facts you must not contradict

These come from verified Sui-ecosystem sources (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)). Do not invent around them.

- Sui: state lives in owned objects with capability-based access control. No inheritance, no dynamic dispatch; generics exist. Package upgrades must be layout-compatible. PTBs chain many Move calls atomically.
- Walrus: content-addressed blob storage coordinated by Sui; `blob_id` is the content hash. Durable, not low-latency. All blobs are public, so encrypt with Seal first. Reads survive with 2/3 of nodes responsive.
- Seal: client-side encryption with on-chain `seal_approve` policies. A policy function name starts with `seal_approve`, takes `id: vector<u8>` first, is a non-public entry function, must abort to deny, and is side-effect free (it runs in dry-run on stateless threshold key servers). Mainnet since Sep 2025. Committee (t-of-n) mode is now GA, alongside owner-only, allowlist, and time-lock; we still ship owner-only first by integration risk, not platform maturity.
- Nautilus: verifiable off-chain compute on a TEE, **live on Sui mainnet (2026)**. Treat as an optional verifiable-compute tier sequenced later by scope, never a launch dependency of the core loop.
- MemWal: agent memory subsystem, official track resource (docs.memwal.ai), **a shipped public-beta SDK** (Mar 2026), exposed as one runtime call.
- Versions to pin (Jun 2026): `@mysten/sui` ~2.17.0, `@mysten/walrus` ~1.1.7 (WalrusFile API + resumable uploads, 2-week epochs), `@mysten/seal` ~1.1.3. Full status table in [sui-tech-reference.md](../02-architecture/sui-tech-reference.md) section 0.

## 5a. Tech-stack decision (do not silently change)

We deliberately do not build everything in one language. Pick the best tool per layer:

- Rust for the snapshot/restore engine and the runtime/sandbox core. Byte-exact, reproducible state capture, low-level filesystem and process control, and performance matter most here, and the surrounding ecosystem (Walrus core, Seal key servers, Firecracker) is Rust.
- TypeScript for the Sui/Walrus/Seal client and glue layer, the public SDK, the CLI, the indexer, and the Console. The official `@mysten/sui`, `@mysten/seal`, and `@mysten/walrus` SDKs are TypeScript-first, and the Console is a Walrus Site so it must run in the browser.
- Move on-chain for the Machine object, provenance, and `seal_approve` policy.
- The Rust engine and the TypeScript client talk across a clean artifact boundary (a manifest plus content-addressed files), matching the adapter separation in [repo-structure.md](../03-engineering/repo-structure.md). See [tech-stack.md](../03-engineering/tech-stack.md) for the why-not-all-TS and why-not-all-Rust reasoning.

## 6. Honest limits you must always preserve

- Checkpoints happen on commit boundaries, not in real time. Never imply live mirroring.
- Revocation is forward-looking; it cannot un-read an already-decrypted checkpoint.
- Encryption hides contents, not the existence or metadata of a checkpoint.
- Reeg is not a regulated PHI / classified-data vault and not an agent framework.
- Every checkpoint costs WAL + Sui gas; surface cost, do not hide it.

## 7. The riskiest part of the build

Reproducible snapshot/restore of live runtime state. We constrain captured state to the filesystem workdir plus a command/event log so restore is reproducible and therefore verifiable. If reproducibility is uncertain, narrow the runtime surface rather than weaken verification.

## 8. The Overflow context

- Track: Walrus track, framed as the verifiable data and memory layer.
- Prizes: $35k for 1st, 50/50 payout, 100% upfront if mainnet by Aug 27.
- Build deadline for the demo: June 21.
- Judging weights: RWA 50%, Product 20%, Technical 20%, Presentation 10%.
- The acceptance demo: run an agent, checkpoint, kill the host, restore on another host, and have an outsider verify the whole run in the Console with the Reeg backend stopped. If any of that needs a live Reeg backend to be believable, the demo failed its own thesis.

## 9. How to behave when working on Reeg

- Build only what is requested or clearly necessary. No speculative abstractions, no helpers for one caller.
- Validate at boundaries (chain reads, network, user input), not everywhere.
- Treat the `seal_approve` policy and the provenance chaining as security-critical; they get extra review (see [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)).
- Do not introduce any dependency that makes verifying a past run require a live Reeg service.
- Do not auto-scaffold or generate the codebase without an explicit greenlight from the human.

## 10. Voice rules (for any text you write: code comments, docs, copy)

- No em dashes. Use hyphens or rephrase.
- Avoid AI-tell vocabulary and filler. Lead with the point. Be concrete.
- In markdown, link files as markdown links, never as inline-code filenames.
- Comment the why, not the what. Do not add comments or docstrings to code you did not change.

## 11. Where everything lives

- Why and vision: [product-vision.md](../00-overview/product-vision.md).
- Terms: [glossary.md](../00-overview/glossary.md).
- Verified facts: [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).
- Architecture: [system-architecture.md](../02-architecture/system-architecture.md), [data-model.md](../02-architecture/data-model.md).
- Threat model: [security-and-threat-model.md](../02-architecture/security-and-threat-model.md).
- Requirements: [requirements-analysis.md](../01-product/requirements-analysis.md).
- Personas + use cases: [personas-and-use-cases.md](../01-product/personas-and-use-cases.md).
- SWOT: [swot.md](../01-product/swot.md).
- Roadmap: [roadmap.md](../01-product/roadmap.md).
- Engineering: [engineering-standards.md](../03-engineering/engineering-standards.md), [build-roadmap.md](../03-engineering/build-roadmap.md), [repo-structure.md](../03-engineering/repo-structure.md), [tech-stack.md](../03-engineering/tech-stack.md), [testing-strategy.md](../03-engineering/testing-strategy.md).
- Business: [business-model.md](../05-business/business-model.md), [brand-and-domain.md](../05-business/brand-and-domain.md).
- Whitepaper: [reeg-whitepaper.md](../whitepaper/reeg-whitepaper.md).
- Start here for navigation: [README.md](../README.md).
</content>
