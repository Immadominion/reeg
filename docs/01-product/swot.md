# SWOT Analysis

A blunt read on where Reeg stands. No cheerleading. Each point is something we can act on. Cross-references: [product-vision.md](../00-overview/product-vision.md), [sui-tech-reference.md](../02-architecture/sui-tech-reference.md), [business-model.md](../05-business/business-model.md).

## Strengths

- S1 Ownership is the one thing a centralized box cannot copy. Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment. It versions and proves over the sandbox (not the compute, not a server, not an OS): it gives you a computing environment you hold (an object on Sui plus your data on Walrus), so you can share it, fork it, and move it off any vendor. We lead with AI-agent runs as the wedge, but the same layer holds for any environment you run. Every competitor can match a feature; none can hand you ownership. That is the moat.
- S2 The architecture leans on primitives that already work today: Sui object ownership, Walrus content-addressed blobs, Seal client-side encryption. We are composing verified pieces, not inventing cryptography (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- S3 Ownership is enforced on-chain by a Seal `seal_approve` policy, so "you own it" is a code fact, not a promise in a ToS.
- S4 Proof comes for free, and it makes a killer demo: kill the host, restore elsewhere, and verify with our server down. We did not build an audit feature; it falls out of living on Sui, which is exactly why it is hard to copy. That moment reads instantly to a non-technical judge.
- S5 Clean fit to the track thesis (verifiable data and memory layer) and a real RWA angle (agent work records, compliance evidence), which is 50% of judging.

## Weaknesses

- W1 Walrus is durable storage, not low latency. We checkpoint on commit boundaries, so Reeg is not a live mirror. We must keep saying this; if a user expects real-time, they feel let down.
- W2 Cost: every checkpoint spends WAL + Sui gas. Heavy checkpointing gets expensive, and we have to expose that honestly (see NFR-7 in [requirements-analysis.md](requirements-analysis.md)).
- W3 Snapshot/restore of arbitrary runtime state is hard to make truly byte-reproducible. We constrain the runtime (filesystem + command log) to keep restore honest; that limits what kinds of agents fit cleanly at first.
- W4 Small team, fixed window. The newer tiers (Nautilus TEE, Seal committee mode) are now mainnet/GA, but we still treat them as a follow-on by scope, not a launch bet, and keep the core loop independent of them.
- W5 No distribution yet. The tech can be right and still unknown.

## Opportunities

- O1 Regulatory tailwind: the EU AI Act logging duties for high-risk systems start applying 2 Aug 2026. "Keep an automatically generated, tamper-evident record of what the agent did" becomes a thing teams must buy, not just want.
- O2 The agent infra market is forming now. "Where does the work actually run, and who can prove it" is an unsolved layer; sandbox vendors own the runtime but not the proof. Reeg sits over their sandbox, not against it: agents first, then any environment that runs in one.
- O3 Portability as a wedge: teams hate vendor lock to a single sandbox host. Restore-anywhere is a concrete reason to adopt.
- O4 Ecosystem pull on Sui/Walrus: being a flagship real use of Walrus + Seal + provenance is good for grants, partnerships, and co-marketing.
- O5 B2B compliance buyers pay for evidence and audit, which is a healthier revenue base than consumer crypto.

## Threats

- T1 Centralized sandbox vendors (for example Daytona, E2B, Blackbox) already run, snapshot, and restore agents, and some market "audit logs" and "no black boxes." We do not compete with the sandbox. Reeg is the layer over it, for computing environments, agents first. We snapshot, prove, move, and let you own whatever runs in their sandbox or any other. The sharp line is ownership: their environment lives in their database and you rent it; ours is yours to own, share, fork, move, and verify. They cannot copy that without rebuilding on something like Sui.
- T2 A hyperscaler ships "owned, verifiable agent runs" and the category gets commoditized. Mitigation: own the neutral, cross-vendor, user-owned position they structurally avoid.
- T3 Platform risk: Walrus, Seal, Nautilus are young. A breaking change or an outage on a dependency hits us directly.
- T4 Narrative risk: leading with "blockchain" or "audit logs" makes us sound like a solution chasing a problem. We must lead with the use case (Reeg is Dropbox for AI agent environments: snapshot and prove what your agent did) and an environment you own, and frame proof as the differentiator, the tamper-proof history GitHub and vendor logs cannot give you, not as buried jargon. Keep Git only as a mechanic, never as a borrowed-brand tagline.
- T5 If checkpoint UX is clunky or slow, people route around it and we lose the ownership and provenance that make us valuable.

## What this tells us to do

- Lead with S1 (ownership) and the share/fork/move story; that is the adoption wedge and the part nobody can copy.
- Use S4 (offline-verifiable demo) as the closer, framed as a free consequence of ownership, not as the opening pitch.
- Neutralize T1 head-on: say plainly we do everything the fast boxes do, then show the one thing they cannot (you own it).
- Respect W1/W2 by being honest about latency and cost in the engineering and feasibility docs, not in the headline pitch (T4).
- Treat Nautilus/committee Seal as upside (O-roadmap), never as a launch dependency (W4).
- Aim the business at O1 + O5: own-and-share value for every team, compliance evidence for the teams that must have it.
</content>
