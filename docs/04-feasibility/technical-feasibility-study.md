# Technical Feasibility Study

Can we actually build Reeg, on these platforms, in this window, and have it do what we claim? This is the honest engineering answer, component by component, with the risks named and the fallbacks written down. Every platform fact traces to [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

## Verdict up front

Feasible for the June 21 demo with one hard constraint: we must keep the runtime surface narrow enough that restore is reproducible, because verification is only meaningful if a restored state can be checked against a recorded hash. The chain, storage, and encryption layers are built on primitives that work today. The single highest-risk piece is reproducible snapshot/restore of live runtime state, and we de-risk it by constraining what state we capture.

## Component-by-component

### 1. On-chain Machine object and provenance (Sui / Move)

- Feasibility: high. Sui's object model gives us owner-controlled state and capability-based access directly. A Machine is an owned object; provenance is an append-only, hash-chained head updated via PTB. PTBs let us register a checkpoint and append provenance atomically.
- Why it works now: this uses core, stable Sui features, no testnet-only dependency.
- Risk: package upgrade compatibility if struct layout changes mid-build. Mitigation: design the Machine and provenance structs for layout-compatible upgrades from the start (see [engineering-standards.md](../03-engineering/engineering-standards.md)).
- Fallback: none needed; this is the solid floor of the system.

### 2. Checkpoint storage (Walrus)

- Feasibility: high. Walrus stores content-addressed blobs where `blob_id` is the content hash, which hands us integrity and verification for free. Verified Move structs (`Blob`, `Storage`) confirm the on-chain handles we anchor to.
- Why it works now: Walrus is the track's headline primitive and is usable on testnet/mainnet.
- Risk: latency and cost. Walrus is durable storage, not a low-latency database; each checkpoint costs WAL + Sui gas. Mitigation: checkpoint on commit boundaries, not continuously; expose cost; let the operator tune granularity (NFR-3, NFR-7 in [requirements-analysis.md](../01-product/requirements-analysis.md)).
- Fallback: coarser checkpoint cadence; deltas instead of full snapshots to cut blob size.

### 3. Encryption and access control (Seal)

- Feasibility: high. Seal is on mainnet (since Sep 2025) with an open operator set; the SDK (`@mysten/seal` ~1.1.3) and production key servers exist. The policy rules are well-defined (abort to deny, side-effect free, `id: vector<u8>` first param).
- Why it works now: owner-only, allowlist, time-lock, and committee (t-of-n) are all production patterns. **Committee mode graduated to GA, so it is no longer a testnet-only dependency.**
- Sequencing: we still ship owner-only first, add allowlist grants, then committee for higher-assurance sharing - by integration risk, not by platform maturity (W4 in [swot.md](../01-product/swot.md), roadmap phases E/I).
- Risk: revocation is forward-looking only. This is a property to communicate, not a bug to fix (L1 in [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)).
- Fallback: none needed; the launch path uses production-GA Seal patterns.

### 4. Snapshot / restore engine (our code) - the hard part

- Feasibility: moderate, and the gating risk. Capturing arbitrary live process/memory state and restoring it byte-identically on another host is genuinely hard. Current ground truth confirms it: CRIU-style cross-host process migration still requires identical library versions and paths on the target, so it is not a general "restore anywhere" tool. We do not attempt full live-process migration.
- Decouple the two concerns: the **isolation boundary** (how a live agent is contained) and the **snapshot engine** (how state is captured and restored). The moat is the second one, so we build it first and best, behind a runtime adapter whose isolation tier is swappable (OCI container + OverlayFS first, Firecracker microVM later). See [system-architecture.md](../02-architecture/system-architecture.md) section 2.1.
- Approach that makes it feasible: constrain the captured state to the filesystem workdir plus a command/event log, hash it into a manifest, and restore by rebuilding the workdir and resuming from a known boundary. The current SOTA stack for this is concrete: **BLAKE3 content-addressing, an OverlayFS upper-layer delta over a read-only composefs/EROFS lower, fs-verity on read-only layers, and a canonical deterministic manifest serialization.** This makes restore reproducible and therefore verifiable.
- Why Rust here: this engine is the gating risk, so we build it in Rust, where we get byte-exact control of files and bytes and no GC nondeterminism, the qualities reproducible restore depends on. Mature Rust crates exist for the primitives (blake3, content-addressed stores). It also keeps us native to the Rust ecosystem we lean on (Walrus core, Seal key servers, Firecracker). The TypeScript client never touches this; it consumes the manifest across a clean boundary (see [tech-stack.md](../03-engineering/tech-stack.md)).
- Risk: hidden non-determinism makes a restored workdir differ from the recorded hash. The known sources are enumerable and must each be neutralized: file/archive timestamps, uid/gid, hash-table iteration order, clock state, and library versions. Mitigation: canonical serialization, pinned libraries, define checkpoint boundaries at stable points, record what is in scope, and report any drift rather than hiding it (NFR-8).
- Fallback: narrow the supported agent pattern to one with clean, file-based state, prove the loop there (roadmap phase B), then widen.

### 5. Console as a Walrus Site

- Feasibility: high. A static site that reads Sui + Walrus and runs verification client-side is well within scope, and deploying it as a Walrus Site removes the "hidden trusted backend" objection.
- Risk: doing full verification in the browser (reading the chain, walking the provenance chain, hashing) must be performant enough to feel instant in a demo. Mitigation: use the indexer for display, but keep verification reading authoritative public data.
- Fallback: a thin local verifier CLI as a backup demo path if the in-browser verify is slow.

### 6. Agent memory (MemWal)

- Feasibility: high as an integration. Now a shipped public-beta SDK (Mar 2026) with semantic search and framework integrations, exposed as one runtime call. The `memory_pointer` rides inside the checkpointed manifest, so memory is restored and verified with the environment.
- Risk: beta surface and API churn. Mitigation: keep it a later phase (roadmap phase K), behind the runtime adapter, not a core-loop dependency.

### 7. TEE-attested compute (Nautilus) - optional mainnet tier, off the critical path

- Feasibility: real and now on mainnet. Nautilus gives verifiable off-chain compute via AWS Nitro Enclaves or Marlin Oyster, with PCR-based attestation verified on-chain at registration; custom PCR verification is GA, with production integrations. The listed use cases include AI agents with on-chain provenance, which is squarely us.
- Decision: treat as an optional verifiable-compute tier sequenced later **by scope, not by maturity** (roadmap phase N). It deepens the compliance and proof story (attesting what code ran), but the core own/share/move/prove loop never depends on it (L4 in [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)).

## Time and window

- Build deadline for a working demo: June 21. Mainnet by Aug 27 unlocks 100% upfront payout.
- The chain/storage/encryption layers (components 1-3, 5) are buildable in the window with low uncertainty. The schedule risk concentrates entirely in component 4.
- Sequencing that respects this: get checkpoint/restore working on a single host first (prove reproducibility), then add Walrus + Seal + the Sui anchor, then the Console verify, then kill-and-restore across hosts. This front-loads the riskiest piece.

## Overall risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Restore not reproducible enough to verify | Medium | High | Narrow runtime surface to file-based state; report drift; demo on a clean pattern |
| Checkpoint cost/latency feels bad | Medium | Medium | Commit-boundary checkpoints; deltas; surface cost honestly |
| Over-reliance on newer tiers (committee Seal, Nautilus, MemWal beta) | Low (by choice) | Medium | All are mainnet/shipped now; still sequence them after the core loop by scope; keep core loop independent of them |
| In-browser verify too slow for demo | Low | Medium | CLI verifier fallback; indexer for display only |
| Platform breaking change mid-build | Low | High | Pin versions; isolate adapters behind `chain`/`storage`/`crypto` modules |

## Demand and positioning (the honest non-technical risk)

Feasibility is not only technical, so this study names the demand risk plainly. The
bigger uncertainty for Reeg is not "can we build it" - we can - but "do enough people
want this exact thing."

- **The market is real and funded.** Agent sandboxes are a live category: E2B raised a
  $21M Series A (mid-2025, claims most of the Fortune 100), Daytona raised $24M (early
  2026) and already ships fork/branch/snapshot, and Cloudflare shipped a Sandbox SDK to
  GA. So "agents need somewhere to run" is settled.
- **Our specific wedge is the soft part.** Public user complaints about sandboxes
  cluster on cost, session limits, reliability, and lock-in - not on "I need to
  independently prove what my agent did" or "I need to own and move the environment."
  Incumbents already do snapshot and fork. So **own and prove is, today, aspirational
  demand**, not demonstrated demand. We should pressure-test the one-liner on real,
  non-crypto operators before over-investing in any one frame.
- **Compliance is the one concrete pull.** The EU AI Act Article 12 logging duties for
  high-risk AI systems apply 2 August 2026 and require automatic, tamper-evident,
  independently examinable records with a minimum retention period. That is a budget
  line, not a nice-to-have, and it maps directly onto what Reeg already produces. This
  is why compliance is treated as a first-class concern in
  [system-architecture.md](../02-architecture/system-architecture.md) section 6 and gets
  its own roadmap phase, even though the product still leads with own and share.
- **Macro caveat:** a large majority of enterprise agent pilots never reach production.
  The category is growing but noisy, so adoption timing is a real external risk we do
  not control.

The honest synthesis: **the risk is positioning and demand, not feasibility.** The
offline-verifiability property is genuinely hard for a centralized vendor to copy, which
is a durable advantage if the wedge lands. We de-risk demand the same way we de-risk the
engine: ship the everyday value (own, share, move) first, keep the compliance evidence
path first-class for the buyers who must purchase it, and avoid betting the product on a
single unproven motivation.

## Conclusion

The thesis is buildable on real, current primitives. The win condition is disciplined scope on the snapshot/restore engine: prove owned + provable + portable on a clean runtime pattern, with the offline-verify demo as the non-negotiable deliverable. Everything fancier (committee policies, TEE compute, broad runtime support) is post-demo upside, not a prerequisite.
</content>
