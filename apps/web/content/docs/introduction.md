# Introduction

Reeg makes environments portable.

Every important thing in computing eventually became portable. Files became portable — Dropbox. Code — Git. Containers — Docker. Data, too. Each one looked like plumbing nobody asked for, right up until it was the ground everyone stood on.

But one layer never moved: the environment. Not the blueprint a container ships — the *live* place the work actually happens: the files, the state, the memory, the work in progress. An AI agent runs for hours inside one, the session ends, and it's gone. You can't keep it, move it to another machine, hand it to a teammate, or prove what happened inside.

**Reeg makes environments portable.** It's infrastructure for portable computing environments. We started with AI agents because that's where ephemeral environments are exploding first — but the underlying system can preserve and move any environment.

## What Reeg is — and isn't

Reeg is the layer **over** whatever sandbox you already run. Not the sandbox, not a server, not an OS. You run the work; Reeg waits at the commit boundary and versions and proves what it did.

At each commit it snapshots the whole working state, encrypts it on your machine, stores it as your own content-addressed data on Walrus, and anchors a tamper-evident record to a `Machine` object you own on Sui. Run the agent in whatever runner you like — Reeg's local engine, an OCI container, a Firecracker microVM, or a third-party cloud.

## The four things you get

Each is a facet of the same idea: the environment is now portable, and it's yours.

| | What it means |
| --- | --- |
| **Own** | The environment is a Sui object you hold, plus your own data on Walrus — not a row in a vendor's database. No one can change it, lock you out, or delete it. |
| **Share** | Hand a teammate the live environment — not a transcript — under a grant/revoke policy you control. Fork a good one to run two directions at once. |
| **Move** | Kill it on one machine, restore it byte-identically on another — across hosts and across runtime tiers. |
| **Prove** | An append-only, hash-chained history anyone can verify **offline**, from public Sui + Walrus data alone. No Reeg backend in the trust path. |

## What's live today

- **Live on Sui mainnet** — package `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e` (and testnet `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`).
- **Measured cost** — ~0.0099 SUI + ~0.0119 WAL per create + encrypted checkpoint (1 epoch).
- **Green in CI** — Move 40/40, `@reeg/verify` 54/54, plus the engine verified on a real AWS KVM host.

> **Honest note.** On mainnet, encryption, storage, anchoring, and offline verification all work today. The decrypt (restore) of an encrypted checkpoint currently waits on a provider Seal key server, so the full encrypted checkpoint → restore → verify loop is proven end-to-end on **testnet**.

## Next

- **[Quickstart](/docs/quickstart)** — create, checkpoint, move, share, and prove an environment yourself.
- **[How it works](/docs/how-it-works)** — the commit boundary and verification with Reeg switched off.
- **[Architecture](/docs/architecture)** — the Machine package, the snapshot engine, and the verification chain.
