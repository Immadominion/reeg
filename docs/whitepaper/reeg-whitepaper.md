# Reeg Whitepaper

Version: draft for Sui Overflow 2026. This document stands on its own; you can share it with someone who has read nothing else. For the verified platform details behind every technical claim, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

Contact: <hello@reeg.xyz>. Security disclosures: <security@reeg.xyz>.

## Abstract

AI agents increasingly do real work inside sandboxed environments: editing code,
running data jobs, operating systems. Those environments are rented from a vendor and
gone when the session ends. You cannot share a running environment with a teammate,
fork a good run, move it off the vendor, or let an outsider confirm what happened.
Reeg keeps the same snapshot-and-restore experience as a centralized sandbox, but
makes each environment an object you own on Sui backed by your own content-addressed
data on Walrus. That single change lets you own, share, fork, and move an agent's
entire computer, and, because it lives on a public ledger, lets anyone verify what
the agent did without trusting Reeg. Ownership is the product; proof is what
ownership gives you for free.

## 1. The problem

An agent does real work inside an environment, and that environment is a dead end.

- You cannot keep it. It belongs to the vendor and disappears when the session ends.
- You cannot share or fork it. The best you can pass to a teammate or client is a
  transcript, not the actual workspace the agent worked in.
- You cannot move it. The run is tied to one host and one vendor.
- You cannot prove it. The only record of what happened is the vendor's, held by the
  same party whose work is in question.

These are not edge cases. They are the default condition of every agent sandbox in
use right now. The agent's work is real, but the place it happened was never yours.

## 2. Why it matters now

Two forces make this urgent. First, agents are moving from demos to production, where
the work is worth keeping, sharing, and reusing rather than throwing away, and where
a lost or unportable run costs real money. Second, the EU AI Act's record-keeping
duties for high-risk AI systems begin applying on 2 August 2026, requiring
automatically generated, tamper-evident records of system operation. The first force
earns adoption (own and share what your agents do); the second makes it defensible
(the proof you already get for free becomes a requirement).

## 3. What Reeg is

Reeg is a real sandbox for AI agents, with the same core loop as a centralized box:
spin up an environment, run commands and write files, snapshot it, restore it, resume
where you left off. The difference is what the environment is, and what that lets you
do with it:

- Own it: the environment is bound to an object you hold on Sui, backed by your own
  data on Walrus. Not a row in a vendor's database.
- Share and fork it: hand a whole live environment to a teammate, or fork a good
  checkpoint to branch a run, exactly as it was.
- Move it: restore on any host, survive a crash, leave any vendor.
- Prove it: anyone you choose can verify what the agent did, reading only public
  data, with Reeg offline.

The first three are why people adopt. The fourth comes for free because the first
three are built on Sui.

## 4. How it works

Reeg composes three Sui-ecosystem primitives, each used for what it is genuinely good at.

### 4.1 The Machine (Sui)

Each environment is a Machine, an owned object on Sui. State on Sui lives in objects with capability-based access control, so ownership is a fact enforced by the chain, not a promise in a contract. The Machine object carries the current provenance head and references to the latest checkpoint. Programmable Transaction Blocks let Reeg register a checkpoint and append a provenance entry in a single atomic transaction.

### 4.2 The checkpoint (Walrus)

When the agent reaches a commit boundary, Reeg captures the environment state into a snapshot, encrypts it on the client, and stores it on Walrus. Walrus is content-addressed: the blob's identifier is the hash of its contents. That gives integrity for free, because any change to a stored checkpoint changes its identifier, and the Machine object pins the expected one.

### 4.3 The lock (Seal)

Walrus blobs are public, so confidentiality cannot depend on storage. Reeg encrypts every checkpoint client-side with Seal before it leaves the operator's machine. Who can decrypt is decided by an on-chain `seal_approve` policy: owner-only by default, with optional grants to specific addresses. Reeg never holds the keys and never sees plaintext.

### 4.4 The provenance chain

Each checkpoint appends an entry to an append-only, hash-chained record whose head lives on the Machine object. To rewrite history you would have to break the chain to a head that is anchored on Sui and append-only. You cannot, and neither can Reeg.

## 5. Proof, for free

Because every environment is an object on Sui backed by content-addressed storage on
Walrus, a property falls out that no database-backed sandbox can match: anyone can
verify what an agent did without trusting the vendor. Given only a Machine
identifier, an auditor can:

1. read the Machine object and walk the provenance chain from its head,
2. confirm each entry hashes to its parent,
3. fetch the checkpoint blob from Walrus and confirm its identifier equals the hash of its contents,
4. confirm the recorded state hashes match the Machine object.

Every input to this is public, on Sui or on Walrus. None of it requires Reeg to be online or honest. If Reeg disappeared tomorrow, every past run stays verifiable. We did not bolt on an audit log; this is just what owning the environment on Sui gives you. It is the moat precisely because we did not have to build it as a feature.

## 6. What Reeg is not

- Not the fastest sandbox. A centralized box in one datacenter has lower latency. We
  took that trade for ownership; for throwaway scratch work, a centralized box is the
  right tool. We do everything it does and add what it cannot.
- Not a regulated-data vault. Reeg protects and records the application layer; it is not positioned for regulated PHI or classified-data custody.
- Not an agent framework. Reeg is the environment, not the agent's logic.

## 7. Honest limits

- Revocation is forward-looking. Revoking a grant stops future access; it cannot un-read a checkpoint a grantee already decrypted.
- Existence is public. Encryption hides contents, not the fact that a checkpoint exists, nor its metadata.
- Platform maturity. Owner-only and allowlist access policies are the dependable path we lead with; threshold-committee policies and TEE-attested off-chain compute (Nautilus) are now production (committee GA, Nautilus on mainnet), but we treat them as upside sequenced later by scope, not foundations.

## 8. The market

The buyer is a team running agents whose work is worth keeping: developers who want
to snapshot, share, and fork agent environments instead of losing them; teams that
need to move runs across hosts without lock-in; and, increasingly, organizations that
must produce a tamper-evident record of what their agents did to meet the EU AI Act
logging duties. The wedge is concrete and immediate: own and share the agent's
computer instead of renting it and losing it. The competitive line is simple: a
centralized sandbox can match any feature except letting you own the environment, and
ownership is what makes sharing, portability, and independent proof possible at all.

## 9. Conclusion

Agents do real work in environments nobody owns, that nobody can share, move, or
prove. Reeg keeps the snapshot-and-restore experience teams already expect and makes
the environment an object you own on Sui backed by your own data on Walrus. Owning it
is what lets you share it, fork it, move it, and let anyone verify it. We do what the
fast boxes do, on top of the one thing they cannot: real ownership of the place your
agents work.

Learn more: reeg.xyz. Contact: <hello@reeg.xyz>.
</content>
