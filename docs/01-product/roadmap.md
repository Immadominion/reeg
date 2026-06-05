# Roadmap

No code here, only direction and sequence. Each phase has a goal, what ships, and the bar that says it is done. Dates anchor to the Overflow window; everything after is directional, not committed. Platform facts referenced here are in [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

We are building the actual product, not a throwaway MVP. The June 21 submission is a
real, usable version of Reeg that a team could run, not a staged demo. Later phases
add depth, scale, and enterprise features; they do not turn a fake into a real
thing. When this doc defers something, it is deferring scope, never deferring "build
a real product."

## Guiding rule

Ship the real product, then widen it. The thesis is: agent environments you own and
can share, that you can fork, move, and (for free) prove. If a feature does not move
C1 (owned), C2 (shareable), C3 (portable), or C4 (provable), it waits. Lead with own
and share; the rest follows from them.

## Phase 0 — Foundations (now)

Goal: lock the design and the verified platform facts so the build does not wander.

Ships:

- This docs suite: vision, requirements, architecture, data model, feasibility, threat model.
- A working local prototype of the runtime (filesystem + command execution) with a checkpoint that produces a content-addressed manifest.

Done when: the snapshot/restore data model is settled and an internal dry run can checkpoint and restore on the same host.

## Phase 1 — The product, end to end (target June 21)

Goal: ship a real, usable Reeg on testnet that does the full loop, own, share, fork,
move, and prove, not a scripted demo.

Ships:

- Create / run / checkpoint / restore a Machine (FR-1 to FR-4).
- Seal client-side encryption of checkpoints; Walrus storage; on-chain Machine object with hash-chained provenance head (FR-3, FR-7).
- Owner-only access policy via `seal_approve`, plus grant access so an environment can actually be shared with a teammate (FR-10, FR-11).
- Fork a Machine from a checkpoint, so a good run can branch (FR-5).
- Console as a Walrus Site with a provenance timeline, share controls, and a Verify button that works with the Reeg server offline (FR-13, FR-14, FR-16, FR-17).

Done when: a real user can run an agent, snapshot it, share or fork the environment,
kill a host, restore on another, and have an outsider verify the whole run in the
Console with our backend stopped. That is the acceptance bar in [requirements-analysis.md](requirements-analysis.md), and it is the product, not a demo of one.

## Phase 2 — Mainnet and daily-driver polish (target before Aug 27)

Goal: make Reeg something a team reaches for every day, on mainnet, which also
unlocks the 100% upfront payout.

Ships:

- Revoke access and richer sharing/role controls from the Console (FR-16).
- Manifest export for auditors (FR-9).
- MemWal-backed agent memory as one runtime call (FR-18).
- Cost and latency surfaced honestly in the UI (NFR-7, NFR-3).
- Mainnet deployment of the Machine package and policy.

Done when: an external team runs their own agents in Reeg as part of real work,
shares and restores environments, and a third party verifies them, all on mainnet.

## Phase 3 — Trust and depth (post-Overflow)

Goal: strengthen the guarantees and the access model.

Ships (directional):

- Time-limited and allowlist policies hardened; committee (t-of-n) policies, now GA, brought in here.
- Richer provenance: command-log digests, environment manifests, signed result attestations.
- Optional TEE-attested compute via Nautilus, now on mainnet, for runs that need provable off-chain execution. This is upside sequenced by scope, never a launch dependency.
- Retire / storage-lifecycle controls (FR-6) so operators manage checkpoint cost over time.

## Phase 4 — Scale and distribution (directional)

Goal: become the default place agent work lives, for teams and at volume.

Ships (directional):

- Team accounts, multiple operators per Machine, role-based grants.
- Integrations with common agent frameworks and sandbox runtimes so Reeg wraps what teams already use.
- Compliance-evidence exports aligned to the EU AI Act high-risk logging duties (in force 2 Aug 2026).
- Self-serve onboarding and pricing (see [business-model.md](../05-business/business-model.md)).

## What we are deliberately sequencing later

These are scope choices, not admissions that the June product is incomplete. Each is
a real feature that real users will want eventually; none of them is needed for Reeg
to be a genuine product on June 21.

- Live sub-second state mirroring across hosts. Reeg checkpoints; it does not stream (NFR-3). Different product, later if ever.
- Committee (t-of-n) Seal policies and TEE-attested compute (Nautilus): real upside and now production-ready (committee GA, Nautilus on mainnet); we still sequence them after the core loop by scope.
- Positioning as a regulated PHI / classified-data vault. Out of scope by design (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- Building our own agent framework. Reeg is the environment, not the agent's brain.

## Risk gates between phases

- Before Phase 1 close: confirm restore is reproducible enough that verify is meaningful. If not, narrow the runtime surface until it is.
- Before mainnet (Phase 2): confirm cost per checkpoint is acceptable for a realistic run, and that Walrus storage epochs are managed.
- Before leaning on a newer tier (Nautilus, committee Seal): re-confirm its current status in [sui-tech-reference.md](../02-architecture/sui-tech-reference.md) and keep the core loop independent of it.
</content>
