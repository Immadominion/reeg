# Tech Stack

What Reeg is built with and why each piece is here. Every platform claim traces to [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

## On-chain

- Sui (Move) for the Machine object, ownership, and the provenance anchor. Chosen because state lives in owned objects with capability-based access control, and because PTBs let us register a checkpoint and append provenance atomically in one transaction. The owner address is the authority; Reeg is not.
- Seal for client-side encryption and on-chain access policy (`seal_approve`). Chosen because Walrus blobs are public, so encryption must happen before upload, and because the access decision belongs on-chain where the owner controls it, not in a Reeg database. SDK: `@mysten/seal`.

## Storage

- Walrus for checkpoint blobs. Chosen for durable, content-addressed storage where `blob_id` is the content hash, which gives us integrity for free and verification without trusting Reeg. We accept that Walrus is durability, not low latency, and design around commit-boundary checkpoints (NFR-3 in [requirements-analysis.md](../01-product/requirements-analysis.md)).
- MemWal for agent memory, exposed through one runtime call. It is an official track resource (docs.memwal.ai) and keeps memory inside the same owned, checkpointed environment.

## Off-chain / application

We pick the best language per layer instead of forcing one language everywhere. The split follows a clean artifact boundary (a manifest plus content-addressed files), so the two sides stay independent.

- Rust for the snapshot/restore engine and the runtime/sandbox core. This layer captures and rebuilds byte-exact environment state, walks the filesystem, computes content hashes and deltas, and controls process execution. Reproducibility, performance, and low-level control decide whether restore is trustworthy at all, and Rust is the right tool for that, with no GC pauses and exact memory and byte control. It also sits in good company: Walrus core and the Seal key servers are Rust, and the sandbox layer (for example Firecracker) is Rust, so we stay native to the ecosystem we depend on.
- TypeScript for the Sui/Walrus/Seal client and glue layer, the public SDK, the CLI, the indexer, and the Console. The official `@mysten/sui`, `@mysten/seal`, and `@mysten/walrus` SDKs are TypeScript-first, so the chain, storage, and encryption integration is fastest and least error-prone in TS. The SDK and CLI live where our users already are (the JS/TS agent ecosystem), and the Console is a Walrus Site, so it must run in the browser, which forces TS there regardless.
- The Rust engine produces and consumes a manifest (content hashes plus deltas) and content-addressed files; the TypeScript client encrypts, uploads to Walrus, and anchors on Sui. Neither side reaches into the other's internals, which matches the adapter separation in [repo-structure.md](repo-structure.md).
- The runtime surface is kept narrow on purpose so that restore can be reproducible enough for verification to mean something (see [technical-feasibility-study.md](../04-feasibility/technical-feasibility-study.md)).
- Console deployed as a Walrus Site (static, no privileged backend) so the demo has no hidden server doing the trusting.
- An off-chain indexer for Console responsiveness, rebuildable from chain events and never on the verification trust path.

## Why not one language

- Why not all TypeScript: the snapshot engine needs byte-exact, reproducible state capture and tight control over the filesystem and processes. A garbage-collected runtime makes byte-for-byte reproducibility and performance harder exactly where the whole product's trust depends on it. Convenience is not worth weakening the load-bearing part.
- Why not all Rust: the Sui, Walrus, and Seal SDKs are TypeScript-first, and the Console must run in the browser as a Walrus Site. Forcing Rust on the client layer would mean fighting the official SDKs and reimplementing browser glue for no benefit. Use TS where the ecosystem is TS-first.
- The cost of two languages is one clean serialization boundary, which we want anyway for testability and for letting the engine and client evolve independently.

## Deliberately deferred

- Nautilus (verifiable off-chain compute on a TEE) is on Sui mainnet now. It stays an optional tier for runs that need provable off-chain execution, sequenced later by scope, not a launch dependency.
- Seal committee (t-of-n) policies are GA now; we still ship owner-only and allowlist first, by integration risk rather than platform maturity.

## Why this combination wins

The stack is the moat. Sui makes each environment an owned object the operator controls; Walrus makes stored state content-addressed and durable; Seal makes it private without handing keys to Reeg. Together they let you own an agent's environment, share or fork it, move it across hosts, and (for free) let an outsider verify a run with the Reeg server offline, which no database-backed sandbox can match. The Rust engine makes restore byte-reproducible enough that the proof actually means something. See [system-architecture.md](../02-architecture/system-architecture.md) for how the pieces connect.

## Versioning and config

- Network endpoints (Sui RPC, Walrus aggregator/publisher, Seal key server ids) are configuration in `config/`, so testnet and mainnet differ only by config, not code.
- The Move package is designed for layout-compatible upgrades; struct changes consider on-chain layout from day one.
</content>
