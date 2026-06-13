# Brand and Domain

The name, the voice, and the practical identity details (domain, email) so anything customer-facing is consistent. Keep this current; it is the source of truth for how Reeg presents itself.

## Name

Reeg.

- Pronounced like "reeg" (one syllable).
- The product one-liner: Reeg is GitHub for AI agents. Snapshot an agent's whole
  environment, prove exactly what it did, then share, fork, or restore it anywhere.
  You own it, on no one's server.
- Lead with the use case (snapshot and prove what your agent did). "GitHub for AI
  agents" is the handle; the value is the two things GitHub cannot give you, a
  tamper-proof history and an environment you actually own.
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

For teams running AI agents that do real work: Reeg snapshots an agent's whole
environment into a record you own, share, fork, and move, with a tamper-proof history
anyone can verify offline. Like GitHub for agent runs, except the history cannot be
rewritten and the environment is yours, on no one's server. Reeg is the version-control
and proof layer for what your agents do, not the sandbox they run in.

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
compute: you run the agent, Reeg versions and proves what it did. "GitHub for AI
agents" replaced it because it conveys the use case in three words.

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
- One-liner: GitHub for AI agents. Snapshot, prove, share, and move what your agents do.
</content>
