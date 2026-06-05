# Reeg Documentation

**Reeg is the computer your AI agents live in: one you own, and can share.** Run an
agent in a real environment (files, packages, commands, memory), then snapshot it,
hand it to a teammate, fork it, or move it to another machine. The same
snapshot-and-restore experience as a centralized sandbox, except the environment is
an object you own on Sui backed by your own data on Walrus, so you can share it,
fork it, move it, and let anyone verify what the agent did. Own it, share it, fork
it, move it, prove it.

Domain: [reeg.xyz](https://reeg.xyz) · Track: Sui Overflow 2026, Walrus · Status:
pre-build (architecture + planning complete, scaffolding next).

---

## Who each doc is for

| If you are...                          | Start here |
|----------------------------------------|------------|
| A teammate joining the build           | [00-overview/product-vision.md](00-overview/product-vision.md), then [ai/AGENTS.md](ai/AGENTS.md) |
| A non-technical person ("what is this")| [00-overview/product-vision.md](00-overview/product-vision.md) |
| An investor / judge                    | [whitepaper/reeg-whitepaper.md](whitepaper/reeg-whitepaper.md), [05-business/business-model.md](05-business/business-model.md) |
| An engineer about to write code        | [02-architecture/system-architecture.md](02-architecture/system-architecture.md), [03-engineering/engineering-standards.md](03-engineering/engineering-standards.md) |
| Anyone checking "can this be built"    | [04-feasibility/technical-feasibility-study.md](04-feasibility/technical-feasibility-study.md) |
| An AI agent working on this repo       | [ai/AGENTS.md](ai/AGENTS.md) |

---

## Map of the documentation

### 00 - Overview

- [product-vision.md](00-overview/product-vision.md) - what Reeg is, who it is for, why it exists, in plain language.
- [glossary.md](00-overview/glossary.md) - every term, defined once.

### 01 - Product

- [requirements-analysis.md](01-product/requirements-analysis.md) - functional and non-functional requirements, prioritized.
- [swot.md](01-product/swot.md) - strengths, weaknesses, opportunities, threats.
- [personas-and-use-cases.md](01-product/personas-and-use-cases.md) - who uses it and for what.
- [roadmap.md](01-product/roadmap.md) - phases from hackathon to product, no code.

### 02 - Architecture

- [system-architecture.md](02-architecture/system-architecture.md) - the full system, components, and how they connect.
- [data-model.md](02-architecture/data-model.md) - the on-chain objects, the off-chain records, and the verification chain.
- [sui-tech-reference.md](02-architecture/sui-tech-reference.md) - verified reference for Walrus, Seal, Nautilus, Move objects, PTBs.
- [security-and-threat-model.md](02-architecture/security-and-threat-model.md) - what we defend against and how.
- [diagrams/](02-architecture/diagrams/) - architecture diagrams as JSON (render to images yourself).

### 03 - Engineering

- [engineering-standards.md](03-engineering/engineering-standards.md) - how we write code so it actually works and scales.
- [build-roadmap.md](03-engineering/build-roadmap.md) - the engineering build sequence, phase by phase, easy to hard, with done bars. No code.
- [manifest-spec.md](03-engineering/manifest-spec.md) - the frozen manifest and artifact-boundary contract between the Rust engine and the TypeScript client.
- [repo-structure.md](03-engineering/repo-structure.md) - the monorepo layout.
- [tech-stack.md](03-engineering/tech-stack.md) - every technology choice and why.
- [testing-strategy.md](03-engineering/testing-strategy.md) - what we test, at what level, and the one test that matters most.

### 04 - Feasibility

- [technical-feasibility-study.md](04-feasibility/technical-feasibility-study.md) - can each piece be built, in what window, at what risk.

### 05 - Business

- [business-model.md](05-business/business-model.md) - how Reeg makes money.
- [brand-and-domain.md](05-business/brand-and-domain.md) - name, domain, email, and identity plan.

### Whitepaper

- [reeg-whitepaper.md](whitepaper/reeg-whitepaper.md) - the standalone document you can share publicly.

### AI

- [ai/AGENTS.md](ai/AGENTS.md) - single source of truth an AI agent loads to know everything about the build.

---

## How to keep these docs honest

1. Every factual claim about Sui, Walrus, Seal, or Nautilus must trace to
   [02-architecture/sui-tech-reference.md](02-architecture/sui-tech-reference.md),
   which cites primary sources.
2. When the build changes, update the doc in the same change. Stale docs are worse
   than no docs.
3. The whitepaper and product vision are the only docs written for outsiders.
   Everything else assumes the reader is on the team.
</content>

</invoke>
