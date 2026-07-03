# Engineering Standards

How we write, review, and ship code on Reeg. The point is that a new contributor (human or AI) can be productive without guessing. Keep this short and enforced rather than long and ignored.

## Principles

- Build only what is requested or clearly necessary. No speculative abstractions, no helpers for a single caller.
- Validate at boundaries (user input, network, chain reads), not everywhere. Do not add error handling for cases that cannot happen.
- The verification path is sacred: never introduce a dependency that makes verifying a past run require a live Reeg service.
- Honest behavior over impressive appearances. If something is checkpoint-boundary and not real-time, the code and the copy both say so.

## Language and structure

- Move for on-chain logic (Machine package, `seal_approve` policy). Explicit objects and capabilities; no attempt to fake inheritance or dynamic dispatch (Move has neither, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- TypeScript for the runtime, CLI/SDK, indexer, and Console.
- One responsibility per module. The snapshot engine, the chain client, and the Seal/Walrus adapters stay separable so they can be tested in isolation.

## On-chain code rules

- Package upgrades must be layout-compatible; design structs with upgrade in mind.
- PTBs compose operations atomically (register blob + append provenance + update head in one transaction). Do not split an invariant across transactions.
- `seal_approve` functions follow the mandatory shape in [security-and-threat-model.md](../02-architecture/security-and-threat-model.md): `seal_approve*` name, first param `id: vector<u8>`, non-public entry, abort to deny, side-effect free.
- Anything touching access control or provenance chaining is security-critical and needs a second reviewer.

## Git and review

- Small, focused commits with messages that say what changed and why.
- Branch per change; no direct pushes to the main branch.
- Every change to access control, provenance, or the verification flow requires review before merge.
- Never bypass safety checks (no `--no-verify`, no force-push to shared branches, no `git reset --hard` on shared history).

## Voice and docs (applies to code comments, READMEs, and copy)

- No em dashes. Use hyphens or rephrase.
- Avoid AI-tell vocabulary and filler. Lead with the point, stay concrete.
- In markdown, link files as markdown links, never as inline-code filenames.
- Comment the why, not the what. Do not add comments or docstrings to code you did not change.

## Definition of done

A change is done when:

- it does what the requirement says and nothing extra,
- it has tests at the right level (see [testing-strategy.md](testing-strategy.md)),
- it does not weaken the offline-verifiability guarantee,
- cost and latency implications are understood and surfaced if user-facing,
- docs and diagrams that describe the changed behavior are updated in the same change.

## Secrets and config

- No secrets in the repo. Keys live in the operator's client and in environment configuration, never committed.
- Network endpoints (Sui RPC, Walrus aggregator/publisher, Seal key servers) are configuration, not hardcoded constants, so testnet and mainnet differ only by config.
</content>
