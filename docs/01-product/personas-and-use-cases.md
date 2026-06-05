# Personas and Use Cases

Who Reeg is for, in their own words, and the concrete jobs they hire Reeg to do. Use these when writing copy, prioritizing features, or judging whether a request fits. Terms are defined in [glossary.md](../00-overview/glossary.md).

## Primary personas

### P1 Aria, the agent operator

- Role: builds and runs AI agents that do real work (code changes, data pipelines, ops tasks) for her team or customers.
- Today: she rents sandboxes from a vendor. When a run finishes, the environment disappears. When something goes wrong, she has vendor logs she cannot independently trust and a customer who wants proof.
- Pain: no ownership, no portability, no record she can hand to a skeptical third party.
- What she wants from Reeg: own the environment, checkpoint long runs so a crash does not cost hours, and produce a record her customer can verify without trusting Aria or Reeg.
- Success looks like: "My agent ran for six hours, the box died, I restored it on another host, and my client checked the whole thing themselves."

### P2 Ben, the auditor / counterparty

- Role: reviews what an agent did. Could be a compliance officer, a client, a partner, or a teammate on the hook for the result.
- Today: he gets a vendor's exported log (a PDF or a JSON the vendor generated) and has to take it on faith.
- Pain: the evidence comes from the same party whose work he is checking.
- What he wants from Reeg: open a link, hit verify, and see that the run matches an on-chain record, with no Reeg login and no Reeg server in the loop.
- Success looks like: "I verified the run from public data. I did not have to trust either of them."

### P3 Dana, the platform/infra lead

- Role: decides what agent infrastructure her org standardizes on.
- Today: worried about vendor lock and about the EU AI Act logging duties for high-risk systems landing 2 Aug 2026.
- Pain: needs portability and a tamper-evident record story before her org scales agent use.
- What she wants from Reeg: a portable environment her teams can move between hosts, and an evidence trail that satisfies auditors and regulators.
- Success looks like: "We are not locked to one sandbox vendor, and we can produce records on demand."

## Secondary personas

- P4 The Sui/Walrus ecosystem reviewer: judges and grant committees who want to see real, correct use of Walrus + Seal + on-chain provenance. They care that the verification is genuine, not theater.
- P5 The teammate: a colleague Aria grants read or restore rights to, so they can pick up or inspect a run. Exercises grant/revoke.

## Core use cases

### UC-1 Run and survive a crash (Aria)

1. Aria creates a Machine and runs her agent in it.
2. Reeg checkpoints at commit boundaries.
3. The host dies mid-run.
4. Aria restores on a fresh host; the agent resumes from the last checkpoint.

Hits FR-1 to FR-4 in [requirements-analysis.md](requirements-analysis.md). Proves portability (C3).

### UC-2 Prove a run to a counterparty (Aria + Ben)

1. Aria finishes a run and sends Ben a Console link to the Machine.
2. Ben opens it and clicks Verify.
3. The Console reads Sui + Walrus and confirms the checkpoint chain and state hashes, with Reeg's server offline.
4. Ben sees a pass and the evidence behind it.

Hits FR-7, FR-8, FR-13, FR-14. Proves verifiability without trust (C2). This is the demo's centerpiece.

### UC-3 Grant and revoke access (Aria + Ben)

1. By default only Aria can decrypt and restore (owner-only Seal policy).
2. Aria grants Ben read rights for one Machine.
3. Ben can now decrypt and inspect; others still cannot.
4. Aria revokes; Ben loses access.

Hits FR-10, FR-11, FR-16. Proves ownership (C1) is enforced on-chain, not by Reeg.

### UC-4 Fork an environment (Aria)

1. Aria forks a Machine from a known-good checkpoint.
2. The child Machine carries a parent pointer in its provenance.
3. She explores a risky change in the fork without touching the original.

Hits FR-5. Shows lineage and safe experimentation.

### UC-5 Standardize across hosts (Dana)

1. Dana's teams run agents in Reeg Machines across different hosts/providers.
2. Any run is restorable anywhere and every run carries a verifiable record.
3. When an auditor asks, Dana exports a manifest.

Hits FR-4, FR-9, NFR-2. Proves the org-level value: no lock-in, evidence on demand.

## Anti-personas (not our user yet)

- The team that needs live, sub-second mirroring of session state: Reeg checkpoints on boundaries, it does not stream (NFR-3).
- The org that needs a regulated PHI or classified-data custody vault: Seal is not positioned for that, and Reeg records the app layer, it is not that vault (see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md)).
- The hobbyist who just wants a free scratch sandbox with no record: the record is the point; without it Reeg is just a worse sandbox.
</content>
