# Reeg — Positioning (source of truth)

> This file is the canonical positioning for Reeg. Every other doc, the marketing
> site, the deck, and social copy defer to it. When they disagree with this file,
> this file wins. The **hook/tagline** is "Reeg is Dropbox for AI agent environments"
> (lands instantly; deliberately caps at agents/environments — accepted for now). The
> **supporting line**, used verbatim, carries the breadth: **"Reeg is infrastructure for
> portable computing environments. We started with AI agents because they're the
> fastest-growing source of ephemeral work, but the underlying system can preserve and move
> any environment."** Use both as written. Agents are the wedge; any environment is the ceiling.

---

## The category

**Reeg is infrastructure for portable computing environments. We started with AI agents
because they're the fastest-growing source of ephemeral work, but the underlying system
can preserve and move any environment.**

Not a sandbox. Not a server. Not an OS. The layer over them. You run the work; Reeg
versions and proves what it did. Agents are the wedge; any environment is the ceiling.

## Positioning statement (canonical)

Reeg is infrastructure for portable computing environments. We started with AI agents
because they're the fastest-growing source of ephemeral work, but the underlying system
can preserve and move any environment. You run the work — your agent, your container,
your microVM, someone else's cloud — and at every commit Reeg snapshots the whole
working state, encrypts it client-side, stores it as data you own on Walrus, and
anchors a hash-chained, append-only record to a Sui object only you control. It sits
over the sandbox you already use; it does not run your workload or hold your compute.

## One-liner

Your agent runs in a sandbox you don't own and can't keep. Reeg lets you own that
environment, move it byte-for-byte to any host, and prove its whole history — with
Reeg switched off.

## Hero headline

**Reeg is Dropbox for AI agent environments.**

This is the hook — it lands instantly. It deliberately caps the framing at AI agents and
environments; that's a known limitation the team accepts for now, because the breadth is
carried by the infrastructure line right under it. Pair the headline with the supporting
copy verbatim: *Reeg is infrastructure for portable computing environments. We started with
AI agents because they're the fastest-growing source of ephemeral work, but the underlying
system can preserve and move any environment.*

### Subhead

Your agent runs in a sandbox you don't own and can't keep. Reeg is the layer over it:
snapshot the whole working state, prove exactly what happened, then share it live, fork
it, or restore it byte-for-byte on any host. You own it, on no one's server —
verifiable with Reeg switched off.

---

## The four pillars

| Pillar | The line | The proof |
|---|---|---|
| **OWN** | Own what you run — the environment is an object you hold, not a row you rent. | Every environment is a Sui object you own plus a Walrus blob that is your own data — not a record in a vendor's database. Only the owner mutates it; no vendor can change it, lock you out, or delete it. True whether an agent, a CI job, or a person at a keyboard built it. |
| **SHARE** | Hand over the live workspace — not a transcript. | Share Seal-encrypted checkpoints under an on-chain access policy you grant and revoke (allowlist + time-limited); each grant and revoke appends to the provenance chain. Fork any known-good checkpoint to run two directions at once. |
| **MOVE** | Kill it here, bring it back there — identical. | Determinism is pinned at the byte level (canonical umask, neutralized timestamps and ownership), so a restore is byte-identical across hosts and across runtime tiers — local engine, OCI container, Firecracker microVM. No lock-in to one vendor or datacenter. |
| **PROVE** | Prove the whole history to anyone — with Reeg switched off. | Every checkpoint anchors a hash-chained, append-only record on Sui (current `blob_id` + `manifest_hash`). Anyone you choose verifies the full lineage offline from public Sui and Walrus data alone — no Reeg backend in the trust path. GitHub history can be rewritten; this cannot. |

---

## Origin story (lore)

### Long (~250 words)

We kept watching the same thing happen. An agent would run for hours and get somewhere
real — set up a project, debug a system, build something that mattered — and the moment
the session closed, the place it all happened was gone. Not the chat log. The
environment. The actual working state where the work lived.

You never owned that place. It was a row in someone else's database, on a server you'd
never see, deleted on their schedule, not yours. GitHub came close, but Git history can
be rewritten. A vendor dashboard came closer, until the vendor changed a row, locked an
account, or shut down.

Then we noticed the three things people kept asking for were the same thing wearing
three faces. They couldn't keep the good run. They couldn't hand the live workspace to a
teammate — only a transcript of it. And they couldn't prove to an outsider what actually
happened inside. Keep it, share it, prove it. All of it came down to one missing piece:
you didn't own the environment.

So we built the layer that gives it back. Not a sandbox, not a server, not an OS — the
layer over them. You run the agent wherever you want; Reeg waits at the commit boundary,
snapshots the whole working state, encrypts it before it leaves your machine, stores it
as your own content-addressed data, and anchors an append-only record to a Sui object
only you control. Determinism is pinned, so a restore is byte-identical on any host. It's
live on Sui mainnet today. Agents are where ephemeral work is exploding right now — but
the layer never cared what made the environment. It only cares that you own it, and that
it's true.

### Short (~80 words)

We kept watching good work disappear. An agent would run for hours, get somewhere real,
and then the sandbox closed — and all that was left was a transcript. You couldn't keep
the run, hand the live workspace to a teammate, or prove what happened inside it. GitHub
helped with the code, but Git history can be rewritten, and the environment was never
yours. So we built the layer over the sandbox: snapshot the whole working state, encrypt
it, and anchor it to a Sui object only you control. Own it, move it, prove it — with Reeg
switched off.

---

## Why now

Two forces. One earns adoption; one makes it defensible.

1. **Adoption.** AI agents are moving from demos into production, where a run is worth
   keeping, sharing, and standing behind — so the environment it happened in stops being
   disposable. That is the wedge: the fastest-growing source of ephemeral work, felt as a
   loss the day a good run vanishes.
2. **Defensibility.** The EU AI Act's record-keeping duties for high-risk AI (Article 12)
   come into force **2 August 2026**. That turns automatic, tamper-evident provenance from
   a nicety into a compliance asset — exactly the part GitHub cannot give you, because Git
   history can be rewritten and this cannot.

The first force wins users; the second makes the position hard to leave.

---

## Proof points (measured, use as written)

- **Live on Sui mainnet today** (not a testnet demo), and on testnet — mainnet package id
  `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`.
- **Measured on a real funded run:** ~0.0099 SUI + ~0.0119 WAL per create + encrypted
  checkpoint (1 epoch, including the Walrus upload-relay tip). Package publish ~0.047 SUI;
  on-chain upgrade ~0.05 SUI.
- **All green in CI:** Move package 40/40 (including attestation with a real ed25519
  vector), `@reeg/verify` offline verifier 54/54, `@reeg/chain` 21/21, `@reeg/crypto`
  cross-language vector match vs Move 8/8.
- **Engine verified on a real AWS KVM host** (c8i.2xlarge, 8 vCPU / 16 GiB): Firecracker
  8/8 plus a sudo-gated jailer test, OCI 3/3, lib 11/11. Firecracker Phase M hardening
  19/19 complete.
- **Byte-identical restore** verified across different hosts AND across runtime tiers.
- **Nautilus reproducible enclave:** musl-static ~6.5 MB `.eif`; two cache-cleared rebuilds
  produce identical PCRs; live `EnclaveConfig`s verified offline 4/4 on both networks —
  proving which code produced a checkpoint.
- **Reeg switched off:** anyone you choose verifies the full history offline from public
  Sui + Walrus data alone, no Reeg backend in the trust path.
- Built on the current Sui stack: `@mysten/sui` 2.17, `@mysten/walrus` 1.1.7,
  `@mysten/seal` 1.1.3.

---

## Objection handling

**"Isn't this overclaiming — Reeg is really just compute / a sandbox / an OS with a
marketing skin?"**
No. Reeg does not run your workload or hold your compute. You run the agent in whatever
runner you choose — Reeg's local engine, an OCI container, a Firecracker microVM, or a
third party like Daytona or E2B. Reeg is the layer over the sandbox: it waits at the
commit boundary, snapshots the working state, encrypts it client-side, stores it as your
own Walrus data, and anchors a record on Sui. We retired "AI OS" and "the computer your
agents live in" precisely because they claimed the compute, which Reeg is not.

**"Okay, but it tells me nothing about what I'd actually do with it."**
Four concrete jobs. **Keep** a good agent run instead of losing it when the session
closes. **Share** the live workspace with a teammate under an access policy you grant and
revoke — the real environment, not a transcript — and fork a known-good checkpoint to try
two directions. **Move** it: kill it on one machine and restore it byte-identically on
another, with no vendor lock-in. **Prove** it: hand an auditor or a teammate a
tamper-evident history they verify offline, with Reeg switched off.

**"Is this only for AI agents?"**
Agents are the wedge, not the ceiling. The layer underneath was never agent-specific: it
snapshots, encrypts, anchors, and restores a working environment whether an agent, a CI
job, an eval harness, or a person at a keyboard produced it. We led with agents because
they're the fastest-growing source of ephemeral work and the first place people felt the
loss. The same own / share / move / prove holds for any environment you run — which is why
the category is computing environments, not agents.

**"If it's encrypted, can people you share with actually open it?"**
Checkpoints are Seal-encrypted client-side with an on-chain `seal_approve` access policy,
so an authorized party can decrypt and verify the full history. The one honest open
dependency is a working mainnet Seal key-server for the decrypt step — a
provider-availability matter, not Reeg code. Anchoring, ownership, lineage, and offline
verification of the record itself all work today on mainnet; we surface the key-server
caveat rather than hide it.

---

## Analogy verdict

**The hook is "Reeg is Dropbox for AI agent environments."** It lands instantly, so it's the
headline/tagline. The team accepts that it caps the framing at AI agents and environments —
a known limitation, fine for now — because the infrastructure line carries the real breadth
right under it.

- ✅ Hook / tagline / headline: **"Reeg is Dropbox for AI agent environments."**
- ✅ Supporting line (verbatim): "Reeg is infrastructure for portable computing
  environments. We started with AI agents because they're the fastest-growing source of
  ephemeral work, but the underlying system can preserve and move any environment."
- ✅ Also fine as a *mechanic*: "version control for the whole environment — not just the
  code," with *GitHub history can be rewritten; this cannot.*
- ❌ Still out: "GitHub for AI agents" (caps us at agents without the instant recognition the
  Dropbox line buys).

Lead with the Dropbox hook; let the infrastructure line carry the breadth underneath.

---

## X / social bio

Lead option (146 chars):

> Reeg is Dropbox for AI agent environments. We started with AI agents — the fastest-growing
> source of ephemeral work — but it works for any environment.

Alternates:
- *(155)* Infrastructure for portable computing environments. We started with AI agents — the
  fastest-growing source of ephemeral work — but it works for any environment.
- *(150)* Reeg is infrastructure for portable computing environments. Own any run, move it
  byte-for-byte to any host, prove its history with Reeg switched off. Agents first.

Retired bio (do not reuse): "GitHub for AI agents." ("Dropbox for AI agent environments" is
now the approved hook — see Hero headline.)

See [social-and-bio.md](../05-business/social-and-bio.md) for the full social kit.

---

## Voice guardrails

- Lead with a loss the reader has felt (a good run that vanished), then answer it with
  ownership. Concrete on top, platform breadth one layer down — never the reverse.
- Always frame Reeg as **the layer over** the sandbox. Never imply Reeg is the compute,
  the sandbox, a server, or an OS. "You run the agent; Reeg versions and proves what it
  did."
- Say **restore** is byte-identical — the guarantee is on the round-trip. The capture is
  content-addressed (BLAKE3).
- Keep proof claims anchored to the hash-chain and manifest, not to the agent's behavior.
  Reeg proves which bytes/checkpoints existed and (with Nautilus) which code produced
  them — not that the agent was correct.
- Use "whole working state" / "whole environment." Never imply live kernel or process
  state is captured: it's the working directory plus an optional agent-memory dir.
- **Banned words:** unlock, seamless, revolutionize, empower, supercharge, game-changing,
  "in today's world," "the future of." **Lead with the hook verbatim** ("Reeg is Dropbox
  for AI agent environments"), then the infrastructure line as written. Short sentences,
  concrete nouns.
- Don't hide the mainnet Seal key-server caveat, and don't dwell on it. It belongs on a
  longer page or FAQ — never in the hero or bio.
- Use only the measured numbers as written; never invent figures. When in doubt, cite the
  test counts and the mainnet package id.
