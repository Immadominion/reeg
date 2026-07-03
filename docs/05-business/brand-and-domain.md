# Brand and Domain

The name, the voice, and the practical identity details (domain, email) so anything customer-facing is consistent. Keep this current; it is the source of truth for how Reeg presents itself.

## Name

Reeg.

- Pronounced like "reeg" (one syllable).
- The product one-liner: Your agent runs in a sandbox you don't own and can't keep.
  Reeg lets you own that environment, move it byte-for-byte to any host, and prove
  its whole history, with Reeg switched off.
- Lead with the loss the reader has felt (a good run that vanished), then answer it
  with ownership. The differentiator is the part GitHub cannot match: a history no one
  can rewrite over an environment you actually own. Keep Git only as a mechanic
  (version control for the whole environment, not just the code), never as the handle.
- Always capitalized as Reeg in prose. Not REEG, not reeg, except in domains, handles, and code identifiers where lowercase is conventional.

## Domain

- Primary domain: reeg.xyz.
- The Console and the marketing site live under this domain.
- Use the apex (reeg.xyz) for the main site and subdomains for product surfaces (for example app.reeg.xyz for the Console, docs.reeg.xyz for public docs) as those come online.

## Email

- Support: <support@reeg.xyz>.
- Use role-based addresses, not personal ones, for anything external: <support@reeg.xyz> for help, <hello@reeg.xyz> for general contact, <security@reeg.xyz> for vulnerability reports.
- The security@ address is the disclosure channel referenced by the threat model (see [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)).

## Voice

The same voice we use in code and docs, because the brand and the engineering are the same people being honest.

- Lead with the user's problem, then the answer. Concrete over abstract.
- Plain language. A non-crypto operator should understand the pitch without a glossary.
- No hype words, no AI-tell filler, no em dashes (use hyphens or rephrase).
- Honest about limits: we say checkpoints happen on commit boundaries, not in real time, and we say revoke is forward-looking. Honesty is the brand.

## Positioning line

Reeg is infrastructure for portable computing environments. We started with AI agents
because they're the fastest-growing source of ephemeral work, but the underlying system
can preserve and move any environment. You run the work (your agent, your container,
your microVM, someone else's cloud) and at every commit Reeg snapshots the whole working
state, encrypts it client-side, stores it as data you own on Walrus, and anchors a
hash-chained, append-only record to a Sui object only you control. It sits over the
sandbox you already use; it does not run your workload or hold your compute. The
mechanism is version control and proof for the whole environment, not just the code: the
differentiator GitHub cannot match is that its history can be rewritten and this cannot,
over an environment that is yours, on no one's server.

## On "black box"

We retired "the black box for AI agents" as the headline. Two reasons: it leads with
the recorder/audit angle, which is a benefit we get for free, not the reason anyone
adopts; and "Blackbox" is an existing AI product, so the metaphor invites confusion.
The flight-recorder idea still lives on as a supporting benefit (you get a provable
record for free), never as the lead.

## On "the computer your AI agents live in"

We also retired "the computer your AI agents live in" and "AI OS on Walrus" as the
headline. They overclaimed (Reeg is not a computer, an OS, or a hosted sandbox) and
told a reader nothing about what to use it for. The honest frame is a layer, not
compute: you run the agent, Reeg versions and proves what it did. We likewise retired
"the version-control and proof layer over your sandbox" as a headline; the category is
now "infrastructure for portable computing environments," and version control and proof
survive only as mechanism language for what Reeg does, never as the category.

## On "GitHub for AI agents"

We retired "GitHub for AI agents" as a tagline too. It boxed Reeg into agents-only
when the same layer preserves, moves, and proves any environment you run, and it
borrowed a brand to do it. We kept agents as the wedge (the fastest-growing source of
work worth keeping) and broadened the category to computing environments. Git survives
only as a mechanic, never the handle: "version control for the whole environment, not
just the code," paired with the one thing GitHub cannot match, "GitHub history can be
rewritten; this cannot." The headline is now "Git tracks code. Reeg tracks the environment where the work happened." and the category is "version control for environments."

## What the brand is not

- Not "blockchain audit logs." We lead with versioning and proving the agent's
  environment, not with the chain or the log.
- Not a compliance vault for regulated PHI or classified data. Reeg records and protects the app layer; it is not that custody product (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- Not the sandbox or compute. Reeg is the layer over whatever sandbox an agent runs in
  (local, OCI, Firecracker, or a third party); it versions and proves the environment,
  it is not the agent's brain.

## Usage quick reference

- Name in prose: Reeg.
- Domain: reeg.xyz.
- Support email: <support@reeg.xyz>.
- Security email: <security@reeg.xyz>.
- One-liner: Your agent runs in a sandbox you don't own and can't keep. Reeg lets you
  own that environment, move it byte-for-byte to any host, and prove its whole history,
  with Reeg switched off.
- X / social bio (lead): Infrastructure for portable computing environments. Own any
  environment, move it byte-for-byte to any host, prove its history with Reeg switched
  off. Agents first.
</content>
