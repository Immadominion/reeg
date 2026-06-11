# Demo Script and Storyboard

How we show Reeg in under five minutes so a judge gets it without crypto knowledge.
Two artifacts are covered: the recorded demo video (<= 5 minutes, required by the
track) and the live walkthrough. Both are built around one moment that is hard to
fake and easy to feel.

Reeg is **live on Sui mainnet today** (mainnet package
`0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`). A full
own/share/move/prove cycle plus a TEE-attested checkpoint runs against real on-chain
state. That is the backdrop for every beat below: this is a shipped product, not a
mock.

Judging weights to serve (from [requirements-analysis.md](../01-product/requirements-analysis.md)
and the track): RWA 50%, Product 20%, Technical 20%, Presentation 10%. Every beat
below notes which weight it earns.

## The one idea the demo must land

You own your AI agent's computer, so you can share it, move it, and prove what it did,
none of which a normal sandbox lets you do. We show, in this order: it is a real
working environment (table stakes), then the four things ownership unlocks: **own,
share, move, prove.**

Each agent environment is a **Machine** you own on Sui. Its filesystem and memory are
snapshotted to content-addressed blobs on Walrus, encrypted client-side with Seal,
with a hash-chained provenance log anchored on Sui that anyone can verify offline from
public chain and storage data alone, with no Reeg backend involved.

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

Under the hood this is one capture-and-verify path across real isolation tiers: a
local tier for dev, an OCI container tier (read-only rootfs, per-session tmpfs,
network isolation), and a Firecracker microVM tier with KVM kernel-boundary isolation
and an in-guest agent over vsock. We do not narrate this on camera; it is what lets us
keep the next promises.

### 1:15-2:15 - Own it and share it (RWA, Product)

- Save a snapshot. Show it land in the timeline as "Snapshot saved." This snapshot is
  Seal-encrypted client-side before it ever touches Walrus.
- Share the environment with a teammate by name (not an address). The teammate opens
  it and sees the exact working environment, not a transcript. Behind the calm UI, a
  grant appends to the provenance chain; access is an allowlist with time-limited
  expiry, and it can be revoked. Revocation is forward-looking only: it stops future
  access but cannot un-see data a grantee already decrypted.
- Fork it: branch the environment to try a second approach. Show parent/child; the
  fork carries provable on-chain lineage back to its parent.

The message: this environment is a real, ownable asset you can hand around and
duplicate, because it is yours. (This is the RWA story: the agent's work environment
as an owned, shareable and portable thing.)

### 2:15-3:30 - The undeniable moment (Technical, Product)

- The agent is mid-run. We kill the host. Hard. Show it die.
- We restore on a different machine. The environment comes back byte-for-byte; the
  agent resumes. (Earns Technical: content-addressed, deterministic restore that is
  byte-identical across hosts and across runtime tiers.)
- The beat to let breathe: "Same work, different machine, nothing lost."

### 3:30-4:15 - Prove it, with our servers off (Technical, RWA)

- Bring in an outside person (the "auditor"/teammate). Open the Console's Verify view.
- Turn Reeg's own servers off on camera.
- Click Verify. It still returns "Verified independently. Nothing here was changed
  after the fact." Show this works with our backend down: the verifier reads only
  public Sui and Walrus data and walks the hash-chained provenance head.
- The line: "You do not have to trust us. Anyone can check, even if Reeg disappears."
  Keep it one sentence; do not lecture on cryptography.

Optional wow extension (use if the room is technical): we can prove not just that the
record is intact, but **which code produced it.** The optional Nautilus tier runs a
tiny reproducible AWS Nitro enclave that attests a checkpoint; an offline verifier
confirms the signature and that the enclave's measurements (PCRs) match a trusted,
reproducible build. This tier is strictly additive: a non-attested run is byte-
identical, and the agent still runs in the VM, not the enclave. Keep this to one line
unless asked.

### 4:15-4:30 - Close (Presentation)

Restate the one idea over the product visual: "Reeg is the computer your AI agents
live in. Own it, share it, move it, prove it." Note that it is live on Sui mainnet
today. CTA: reeg.xyz.

## Live walkthrough notes

Same arc, but resilient to live conditions:

- Pre-stage two machines and a teammate device. The own/share/move/prove cycle and
  offline verify run on mainnet today; the full encrypted checkpoint -> restore ->
  verify loop is proven end-to-end on testnet, so prefer testnet for any live
  *decrypt/restore* beat (see honest constraints below). Have a recorded fallback of
  the kill-and-restore in case of network flakiness; never let a dropped connection
  eat the undeniable moment.
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
- We do not overclaim on the live constraints. If asked about mainnet decrypt: on
  mainnet, encryption, storage, anchoring, and offline verify all work today; only
  decrypt-on-restore waits on a working mainnet Seal key-server provider, and the full
  loop is proven on testnet. State it plainly; it is a provider-availability matter,
  not a gap in Reeg.

## Mapping back to the weights

- RWA (50%): the environment as an owned, shareable, forkable asset (1:15-2:15)
  and the verifiable record of real agent work, anchored on mainnet (3:30-4:15).
- Product (20%): it is a genuinely usable sandbox with sharing, forking, and restore
  across real isolation tiers (0:30-2:15, 2:15-3:30).
- Technical (20%): content-addressed cross-host/cross-tier restore, offline
  verification from chain alone, and the optional TEE-attested prove tier (2:15-4:15).
- Presentation (10%): tight story, one undeniable moment, plain language throughout.
