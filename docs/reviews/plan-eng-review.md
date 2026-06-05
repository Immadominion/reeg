# Plan Engineering Review

An engineering-quality review of the Reeg plan and docs, in the spirit of
`/plan-eng-review`. It rates the technical plan (architecture, tech choices,
feasibility, scope) across dimensions, scores each 0-10, says what a 10 looks like,
and lists concrete actions. Actions marked [done] were applied in this pass; the rest
are queued for the build.

Scope reviewed: [tech-stack.md](../03-engineering/tech-stack.md),
[repo-structure.md](../03-engineering/repo-structure.md),
[system-architecture.md](../02-architecture/system-architecture.md),
[technical-feasibility-study.md](../04-feasibility/technical-feasibility-study.md),
[requirements-analysis.md](../01-product/requirements-analysis.md), and
[roadmap.md](../01-product/roadmap.md).

## Scores

| Dimension | Score | One-line reason |
| --- | --- | --- |
| Tech-choice rigor | 9/10 | Rust engine + TS client + Move is the best-tool-per-layer pick, justified |
| Trust-model soundness | 9/10 | Offline verification holds; no hidden trusted backend |
| Riskiest-part identification | 9/10 | Reproducible restore named as the gating risk and de-risked |
| Scope realism for June 21 | 8/10 | Now framed as a real product, not an MVP, with honest sequencing |
| Module boundaries | 8/10 | Clean engine/client artifact boundary; adapters isolated |
| Cost / latency honesty | 8/10 | Stated where it belongs (eng/feasibility), not in the pitch |
| Upgrade / config discipline | 7/10 | Config-per-network and layout-compatible upgrades planned |

## Dimension notes

### Tech-choice rigor (9/10)

- What a 10 looks like: every layer uses the language that is genuinely best for it,
  with the tradeoff written down, and no convenience-driven mediocre default.
- Was: "TypeScript across everything, one language keeps the team fast," which traded
  the load-bearing part (reproducible restore) for convenience.
- [done] Rewrote the stack: Rust for the snapshot/restore engine and runtime core
  (byte-exact reproducibility, low-level control, native to the Rust ecosystem we
  depend on); TypeScript for the Sui/Walrus/Seal client, SDK, CLI, indexer, and the
  browser-forced Console; Move on-chain. Added explicit "why not all-TS" and "why not
  all-Rust" reasoning.
- Remaining: prototype the engine's manifest format early to lock the artifact
  boundary before the client builds against it.

### Trust-model soundness (9/10)

- What a 10 looks like: an outsider verifies a past run with Reeg fully offline, and
  no part of the system secretly requires trusting us.
- Verified: verification reads only public Sui + Walrus data; the indexer is
  rebuildable and never on the trust path; the Console is a static Walrus Site.
- [done] Kept "verification must not require a live or honest Reeg service" as a hard
  invariant in AGENTS.md and NFR-1, even while demoting it as the marketing headline.

### Riskiest-part identification (9/10)

- What a 10 looks like: the single thing that can sink the build is named, and the
  plan front-loads and de-risks it.
- Verified: the feasibility study names reproducible snapshot/restore as the gating
  risk and constrains captured state to filesystem workdir + command log.
- [done] Tied the Rust engine decision to this risk: byte-exact control and no GC
  nondeterminism are why the gating layer is Rust.

### Scope realism for June 21 (8/10)

- What a 10 looks like: the June build is a real, usable product, and what is deferred
  is honestly extra depth, not "make it real later."
- [done] Rewrote the roadmap so June 21 ships the actual product (own/share/fork/move/
  prove end to end), with later phases adding scale and enterprise depth, not turning a
  demo into a product. Moved share (grant) and fork into Phase 1 so the product is
  genuinely shareable at submission.

### Module boundaries (8/10)

- What a 10 looks like: each layer is independently testable and swappable.
- [done] Repo structure now shows an `engine/` Rust crate set and a `packages/` TS
  client meeting at one manifest + content-addressed-file boundary; the engine never
  imports a chain/storage client.

### Cost / latency honesty (8/10)

- What a 10 looks like: cost and latency tradeoffs are documented and surfaced in the
  product, but do not weaken the pitch.
- [done] Latency tradeoff moved out of the headline pitch and kept honest in the eng,
  feasibility, and SWOT docs; cost is surfaced in the UI per NFR-7.

### Upgrade / config discipline (7/10)

- What a 10 looks like: testnet/mainnet differ only by config, and Move upgrades are
  layout-safe from day one.
- Verified: configs live in `config/`; Move package designed for layout-compatible
  upgrades.
- Remaining: write the upgrade-compatibility test before the first struct change.

## Top actions

1. [done] Replace all-TypeScript with Rust engine + TS client + Move, with reasoning.
2. [done] Reflect the Rust engine in repo structure and the feasibility study.
3. [done] Reframe the roadmap as shipping the actual product by June 21.
4. [done] Keep offline-verification as a hard engineering invariant.
5. [queued] Prototype the engine manifest format first to freeze the artifact boundary.
6. [queued] Add a Move layout-compatibility test before any struct change.
7. [queued] Benchmark per-checkpoint cost on a realistic run before mainnet.
</content>
