# Business Model

How Reeg becomes a business, not a hackathon project. Honest and early; numbers here are directional and will be replaced by real ones as we learn. Strategy context is in [swot.md](../01-product/swot.md) and [product-vision.md](../00-overview/product-vision.md).

## What we sell

The product is infrastructure for portable computing environments. We started with AI
agents because they're the fastest-growing source of ephemeral work, but the underlying
system can preserve and move any environment. You run the work in the sandbox you already
use; Reeg is the layer over it (not the compute, not a server, not an OS), and it
version-controls and proves that working state. At every commit it snapshots the whole working state,
fork it, hand it to a teammate, and move it byte-for-byte across hosts. The thing a customer
pays for is owning the place their work happened instead of renting it and losing it.
Verifiable proof of what happened rides along for free, and becomes the thing compliance
buyers pay extra for. We lead with agents because they're the fastest-growing source of work
worth keeping, sharing, and standing behind — but the same own / share / move / prove sells
for any environment a customer runs: a CI run, an eval or research environment, a data
pipeline, or any reproducible workspace worth keeping.

## Who pays, and why

- Agent operators and teams (persona Aria, [personas-and-use-cases.md](../01-product/personas-and-use-cases.md)): pay to stop losing long runs, to share and fork environments with teammates, and to hand a working setup (not a transcript) to a customer.
- Platform/infra leads (persona Dana): pay to avoid sandbox lock-in, move runs across hosts, and (when it applies) satisfy auditors and the EU AI Act high-risk logging duties starting 2 Aug 2026.
- The buyer is B2B. Willingness to pay starts with everyday value (keep, share, and reuse agent environments) and deepens with risk reduction (lost work, disputed runs, compliance exposure), a more durable budget line than consumer crypto spend.

## Why now

The EU AI Act's automatic record-keeping duties for high-risk AI systems begin applying 2 Aug 2026. "Keep a tamper-evident record of what the agent did, that someone else can verify" moves from nice-to-have to obligation for a class of buyers. Reeg is positioned exactly at that need.

## Revenue model (directional)

- Usage-based core: customers pay for checkpoints stored and anchored (which maps to our real Walrus + Sui costs) plus a margin. This keeps pricing honest and aligned with value, and surfaces cost the way the product already does (NFR-7).
- Team subscription: a per-seat or per-org tier for multi-operator accounts, grants/revoke, and compliance-evidence exports.
- Compliance evidence as a premium: exports and attestations aligned to high-risk logging duties, sold to the teams that must produce them.

We do not monetize by holding the customer's data hostage. The record is owner-controlled and verifiable without us, which is the product promise; pricing has to respect that or it contradicts the pitch.

## Cost structure

- Direct: Walrus storage (WAL) and Sui gas per checkpoint, passed through with margin. Seal key-server usage. Compute for the runtime hosts.
- Indirect: engineering, the indexer/Console infra (kept minimal and stateless-rebuildable), and go-to-market.
- The architecture deliberately avoids a heavy trusted backend, which keeps fixed infra cost low and the trust story clean.

## Go-to-market

- Wedge: portability and crash-survival for teams running long agent jobs. Concrete, immediate pain, easy to demo.
- Land: a single team adopts Reeg to stop losing runs and to prove work to one demanding customer.
- Expand: that customer becomes a second user (the verifier), and compliance needs pull in the platform lead.
- Ecosystem: be a flagship real use of Walrus + Seal + on-chain provenance on Sui, which opens grants, co-marketing, and partnerships (O4 in [swot.md](../01-product/swot.md)).

## Competition and our line against it

Centralized sandbox vendors (for example Daytona, E2B, Blackbox) run agents, snapshot
them, and restore them, and some market "audit logs" and "no black boxes." We do not
compete with the sandbox — Reeg is the layer over it: infrastructure for portable
computing environments that version-controls and proves the working state, agents first.
Our line, repeated everywhere: their
environment lives in their database and you rent it; Reeg's environment is an object you
own, so you can share it, fork it, move it off them, and let anyone verify it with our
servers offline. A competitor can copy any feature except letting you own the
environment, and ownership is what makes the rest possible (T1 in
[swot.md](../01-product/swot.md)).

## The grant/prize context

For the Overflow track: $35k for 1st, with a 50/50 payout structure, and 100% upfront if we reach mainnet by Aug 27 (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)). That funds the move from demo to a usable product, but the business does not depend on prize money; it depends on B2B teams paying for evidence and portability.

## Honest risks to the model

- If checkpoint cost is too high for frequent use, usage-based pricing caps adoption. Mitigation: deltas and commit-boundary checkpoints keep per-run cost sane.
- If a hyperscaler ships "verifiable agent runs" natively, the category commoditizes. Mitigation: own the neutral, cross-vendor, user-owned position they structurally will not take.
- If buyers do not yet feel the compliance pain, the wedge has to carry the sale on portability and crash-survival alone, which it can.
</content>
