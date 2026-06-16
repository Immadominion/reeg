# FAQ

Straight answers to the questions people ask first about Reeg — what it is, what it proves, and what it can't do.

Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment. Every important thing in computing eventually became portable — files (Dropbox), code (Git), containers (Docker), data too. The environment never did. Reeg is the layer over the sandbox: you run the work, Reeg versions and proves what it did.

## Is Reeg only for AI agents?

No. Agents are the wedge, not the ceiling.

The layer underneath was never agent-specific. It snapshots, encrypts, anchors, and restores a working environment whether an agent, a CI job, an eval harness, or a person at a keyboard produced it. We led with agents because they're the fastest-growing source of ephemeral work and the first place people felt the loss when a good run vanished. The same own / share / move / prove holds for any environment you run — which is why the category is computing environments, not agents.

## Isn't this just a sandbox? Does Reeg run my compute?

No. Reeg does not run your workload or hold your compute.

You run the agent in whatever runner you choose — Reeg's local engine, an OCI container, a Firecracker microVM, or a third party. Reeg waits at the commit boundary, snapshots the working state, encrypts it client-side, stores it as your own Walrus data, and anchors a record on Sui.

| It is | It is not |
|---|---|
| The layer over the sandbox | The sandbox |
| A record you own and verify | A server you rent space on |
| Snapshot, encrypt, anchor, restore | Your compute |

## Do I have to trust Reeg?

No. You verify offline from public data.

Every checkpoint anchors a hash-chained, append-only record on Sui — the current `blob_id` and `manifest_hash`. Anyone you choose re-walks the chain and re-checks the hashes against the Machine object using public Sui and Walrus data alone, with no Reeg backend in the trust path.

```text
1. Read the Machine object on Sui (owner, blob_id, manifest_hash, provenance_head).
2. Pull the checkpoint blob from Walrus by blob_id.
3. Recompute manifest_hash and the working-dir root hash.
4. Re-walk the provenance chain to provenance_head.
5. All three match -> VERIFIED. Any mismatch -> REJECTED.
```

Reeg's own servers and the Console are conveniences. The record stands without them.

## If checkpoints are encrypted, can people I share with open them?

Yes — under an access policy you control.

Checkpoints are Seal-encrypted client-side. An on-chain `seal_approve` policy decides who may decrypt: owner-only by default, an allowlist for a shared Machine, time-limited expiry for a collaborator. Each grant and revoke appends to the provenance chain. Revocation is forward-looking — it stops future approvals; it cannot un-see data already decrypted.

One honest caveat on mainnet: the decrypt step needs a working Seal key server. On mainnet today there is no free public Open-mode key server yet, so the decrypt (restore) of an encrypted checkpoint currently waits on a provider's key server coming online. That is a provider-availability matter, not Reeg code.

## What works on mainnet versus testnet right now?

| Capability | Mainnet | Testnet |
|---|---|---|
| Client-side encryption | Works | Works |
| Walrus storage | Works | Works |
| Sui anchoring (ownership, lineage) | Works | Works |
| Offline verification | Works | Works |
| Decrypt -> restore | Waits on a provider Seal key server | Works |

Reeg is live on Sui mainnet (package `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`) and testnet (`0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`). Encryption, storage, anchoring, and offline verification all work on mainnet today. The full encrypted checkpoint -> restore -> verify loop is proven end-to-end on testnet.

## What does it cost?

A measured create plus encrypted checkpoint (one storage epoch, including the Walrus upload-relay tip) costs about **0.0099 SUI + 0.0119 WAL** on mainnet.

Retention is a Walrus storage-epoch policy you set (`--epochs`) plus the permanent on-chain provenance head, so you control the window your record-keeping policy calls for.

## What can Reeg NOT do?

Two honest limits, stated plainly.

- **It is not custody for the most sensitive data classes.** Reeg is not a regulated PHI or classified-data vault. Seal is not designed for data whose mere existence is a breach. The value is auditable, tamper-evident records of work — not custody of the most sensitive data classes.
- **It does not prove the agent was correct.** Reeg proves which bytes and checkpoints existed, that the history wasn't rewritten, and — with the optional Nautilus tier — which code produced a checkpoint. It does not prove the agent's output was right. The guarantee is anchored to the hash-chain and manifest, not to the agent's behavior.

For the full mechanics, see the architecture and verification pages.
