# Demo Script and Storyboard

How we show Reeg in under five minutes so a judge gets it without crypto knowledge.
Two artifacts are covered: the recorded demo video (<= 5 minutes, required by the
track) and the live walkthrough. Both are built around one moment that is hard to
fake and easy to feel.

Judging weights to serve (from [requirements-analysis.md](../01-product/requirements-analysis.md)
and the track): RWA 50%, Product 20%, Technical 20%, Presentation 10%. Every beat
below notes which weight it earns.

## The one idea the demo must land

You own your AI agent's computer, so you can share it, move it, and prove what it did,
none of which a normal sandbox lets you do. We show, in this order: it is a real
working environment (table stakes), then the three things ownership unlocks.

## The undeniable moment

The emotional center of the demo: **we kill the machine the agent is running on, and
the work comes back, exactly as it was, on a different machine, and an outside person
confirms nothing was faked, with our servers turned off.** That single sequence
proves portability and trust at once, and you do not need to understand blockchains
to feel it. Build the whole video toward this.

## Video script (target 4:30)

### 0:00-0:30 - The hook (Presentation)

Cold open on the problem, plainly. "AI agents are starting to do real work. But the
computer they work on is rented, it vanishes when the session ends, and you cannot
share it, move it, or prove what happened." Show a normal agent session ending and
everything disappearing. No jargon.

### 0:30-1:15 - It is a real environment (Product)

Show Reeg doing the ordinary thing well: spin up an environment, an agent runs
commands, writes files, installs packages. Make it feel as fast and normal as Daytona
or E2B. The message: this is a real sandbox, we are not a toy. (Earns Product; quietly
neutralizes "how is this different from a sandbox" by first being a good sandbox.)

### 1:15-2:15 - Own it and share it (RWA, Product)

- Save a snapshot. Show it land in the timeline as "Snapshot saved."
- Share the environment with a teammate by name (not an address). The teammate opens
  it and sees the exact working environment, not a transcript.
- Fork it: branch the environment to try a second approach. Show parent/child.

The message: this environment is a real, ownable asset you can hand around and
duplicate, because it is yours. (This is the RWA story: the agent's work environment
as an owned, transferable thing.)

### 2:15-3:30 - The undeniable moment (Technical, Product)

- The agent is mid-run. We kill the host. Hard. Show it die.
- We restore on a different machine. The environment comes back byte-for-byte; the
  agent resumes. (Earns Technical: reproducible restore across hosts.)
- The beat to let breathe: "Same work, different machine, nothing lost."

### 3:30-4:15 - Prove it, with our servers off (Technical, RWA)

- Bring in an outside person (the "auditor"/teammate). Open the Console's Verify view.
- Turn Reeg's own servers off on camera.
- Click Verify. It still returns "Verified independently. Nothing here was changed
  after the fact." Show this works with our backend down.
- The line: "You do not have to trust us. Anyone can check, even if Reeg disappears."
  Keep it one sentence; do not lecture on cryptography.

### 4:15-4:30 - Close (Presentation)

Restate the one idea over the product visual: "Reeg is the computer your AI agents
live in. Own it, share it, move it, prove it." CTA: reeg.xyz.

## Live walkthrough notes

Same arc, but resilient to live conditions:

- Pre-stage two machines and a teammate device, all on testnet (or mainnet at
  shortlisting). Have a recorded fallback of the kill-and-restore in case of network
  flakiness; never let a dropped connection eat the undeniable moment.
- Practice the kill-and-restore until it is boring to you. It must look effortless.
- Keep the wallet/chain interactions off the main screen; they should read as normal
  Confirm dialogs (see the "hide the blockchain" rule in
  [design-brief.md](../06-design/design-brief.md)).

## What we deliberately do not do in the demo

- We do not show hashes, addresses, or a block explorer in the main flow. Proof is
  conveyed as a calm "Verified," not as hex.
- We do not pitch "blockchain audit logs." We pitch owning and sharing the agent's
  computer; proof is the payoff, shown last.
- We do not oversell speed. We never claim to be the fastest sandbox; we claim to be
  the one you own.

## Mapping back to the weights

- RWA (50%): the environment as an owned, shareable, transferable asset (1:15-2:15)
  and the verifiable record of real agent work (3:30-4:15).
- Product (20%): it is a genuinely usable sandbox with sharing, forking, and restore
  (0:30-2:15, 2:15-3:30).
- Technical (20%): reproducible cross-host restore and offline verification
  (2:15-4:15).
- Presentation (10%): tight story, one undeniable moment, plain language throughout.
</content>
