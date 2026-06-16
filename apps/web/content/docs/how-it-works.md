# How it works

You run the work in any sandbox; Reeg versions the whole environment and proves what it did, as a record you own.

Every important thing in computing became portable. Files (Dropbox). Code (Git). Containers (Docker). Data, too. The environment — the live place the work actually happens — never moved. Reeg makes environments portable. It is the layer over the sandbox: you run the workload, Reeg snapshots, encrypts, anchors, and restores the working state around it.

<p align="center"><img src="/docs/diagrams/system-context.png" alt="Reeg system context: you run the agent in any sandbox; Reeg snapshots the working state, Seal-encrypts it client-side, stores it on Walrus, and anchors the record to a Machine object on Sui — verifiable offline with no Reeg backend." width="820"></p>

## The loop

Reeg does not run your workload or hold your compute. You run the agent — or a CI job, an eval harness, or a person at a keyboard — in whatever runner you choose: Reeg's local engine, an OCI container, a Firecracker microVM, or someone else's cloud. Reeg waits at the commit boundary. At each commit, it does four things.

1. **Snapshot.** Capture the working directory (plus an optional agent-memory directory) into a content-addressed store keyed by BLAKE3, alongside a manifest: env vars, tool list, memory pointer, and the working-dir root hash. The manifest is serialized canonically — stable ordering, neutralized timestamps and uid/gid, a pinned umask — so the same input always produces the same `manifest_hash`.
2. **Encrypt.** Seal-encrypt the snapshot on your machine, before it touches the network. You choose the threshold (`reeg checkpoint --threshold t`).
3. **Store.** Write the ciphertext to Walrus as a content-addressed blob. The `blob_id` *is* the content hash, so the blob cannot be swapped without changing its id. Walrus is your own data, not a row in a vendor's database.
4. **Anchor.** Register `blob_id` + `manifest_hash` on a `Machine` object you own on Sui, and append a hash-chained record to its provenance log.

This captures the working directory and a manifest, not live kernel or process memory. That is the deliberate choice that makes restore work across machines.

## Restore

On **any** host and **any** runtime tier, Reeg pulls the blob, decrypts it (if your access policy approves), and rebuilds the working directory from the content-addressed store — byte-identically. Because the capture is content-addressed and deterministic, a restore on a different machine matches the original bit for bit. Drift against the recorded hashes is reported, not hidden.

Byte-identical restore is verified both across different hosts and across runtime tiers — local engine, OCI container, and Firecracker microVM.

## Verify, with Reeg switched off

Anyone you choose verifies the full history offline, from public Sui and Walrus data alone — no Reeg backend in the trust path.

1. Read the `Machine` object on Sui: `owner`, current `blob_id`, `manifest_hash`, `provenance_head`, `parent`.
2. Pull the blob from Walrus by `blob_id` and check `blob_id == hash(ciphertext)`.
3. Recompute `manifest_hash` and the working-dir root hash; check them against the object.
4. Re-walk the provenance chain (`H_n = hash(H_{n-1} || event)`) to `provenance_head`.

All three match means the environment and its history are exactly what was claimed. Tamper with the blob, the manifest, or any log event and at least one hash diverges, so verify fails. The `@reeg/verify` offline verifier covers this in CI (54/54).

## The four facets — portability

Each one is a kind of portability for the environment.

| Facet | What it means |
|---|---|
| **Own** | The environment is a Sui object you hold plus a Walrus blob that is your own data — not a record you rent. Only the owner mutates it; no vendor can change it, lock you out, or delete it. |
| **Share** | Hand over the live workspace, not a transcript. Share Seal-encrypted checkpoints under an on-chain access policy you `grant` and `revoke` (allowlist + time-limited). Each grant and revoke appends to the provenance chain. Fork a known-good checkpoint to run two directions at once. |
| **Move** | Kill it on one machine, bring it back on another — identical. Determinism is pinned at the byte level (canonical umask, neutralized timestamps and ownership), so restore is byte-identical across hosts and runtime tiers. No lock-in to one vendor or datacenter. |
| **Prove** | Every checkpoint anchors a hash-chained, append-only record on Sui. Anyone verifies the full lineage offline from public data alone. GitHub history can be rewritten; this cannot. |

## What's live today

Reeg is live on Sui mainnet and testnet.

- Mainnet package `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`; testnet package `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.
- A measured create + encrypted checkpoint (1 epoch, including the Walrus upload-relay tip) costs **~0.0099 SUI + ~0.0119 WAL** on mainnet.
- Move package 40/40, `@reeg/verify` 54/54, `@reeg/chain` 21/21, `@reeg/crypto` cross-language vector match 8/8, all green in CI. Engine verified on a real AWS KVM host: Firecracker 8/8 plus jailer, OCI 3/3, lib 11/11.
- Built on the current Sui stack: `@mysten/sui` 2.17, `@mysten/walrus` 1.1.7, `@mysten/seal` 1.1.3.

### One honest caveat

On mainnet, encryption, storage, anchoring, and offline verification of the record all work today. The **decrypt** (restore) of an encrypted checkpoint currently waits on a provider's mainnet Seal key server — a provider-availability matter, not Reeg code. The full encrypted checkpoint → restore → verify loop is proven end to end on testnet. We surface this rather than hide it.
