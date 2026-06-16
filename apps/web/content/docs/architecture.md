# Architecture

How Reeg is built, component by component, and why a record it produces is provable offline from public data alone.

Every important thing in computing became portable, files (Dropbox), code (Git), containers (Docker), data, but not the environment itself. Reeg makes environments portable. It is the layer *over* the sandbox you already use: you run the work, Reeg versions the whole working state and proves what it did. Agents are the wedge, they are the fastest-growing source of ephemeral work, but the system underneath can preserve and move any environment.

Reeg is live on Sui mainnet. The mainnet Machine package is `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`; the testnet package is `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`. A measured create plus encrypted checkpoint (1 epoch, including the Walrus upload-relay tip) costs about 0.0099 SUI and 0.0119 WAL.

## The mental model

A real OS is a filesystem, processes, permissions, and persistent state. Reeg builds that as an ownable, verifiable thing.

| OS concept | Built on | What you get |
|---|---|---|
| Disk / filesystem | Walrus blob | environment state as content-addressed data you own |
| Kernel / permissions | Sui `Machine` object | who can read, fork, run, get paid: programmable |
| Encryption | Seal | encrypted on your machine before it leaves |
| Processes | `Runtime` trait | one interface; the isolation tier is swappable |
| Syscall log | Sui-anchored records | a verifiable log of what the env held and what ran |
| Verified execution | Nautilus (optional) | prove the code that produced a checkpoint |

The technical contribution is the Move `Machine` package and the snapshot/restore engine. Reeg wraps an existing runtime and owns the ownership and verifiability layer on top of it.

## Components

<p align="center"><img src="/docs/diagrams/component-architecture.png" alt="Reeg component architecture: an agent runs in the Reeg runtime and snapshot engine, which Seal-encrypts client-side and stores content-addressed blobs on Walrus, registering against the Machine package, AccessPolicy, and attestation modules on Sui; the Console reads Sui and Walrus directly with no trusted backend." width="820"></p>

The Rust engine and the TypeScript client meet at exactly one artifact boundary: a manifest plus content-addressed files. The engine never imports a chain or storage client; the TS side never reaches into snapshot internals. That boundary is what lets the same captured environment cross hosts *and* runtime tiers byte-identically.

### Snapshot engine and runtime (client side)

Two concerns live here and they are deliberately decoupled: the isolation boundary (how a live agent is contained) and the snapshot engine (how state is captured and restored). The moat lives in the second one.

<p align="center"><img src="/docs/diagrams/snapshot-restore-sequence.png" alt="Snapshot and restore sequence: capture the working directory into a BLAKE3 content-addressed store with a canonical manifest, Seal-encrypt, upload to Walrus, anchor blob_id and manifest_hash on Sui; restore pulls the blob, decrypts, and rebuilds the workdir byte-identically on any host." width="820"></p>

The engine captures the filesystem workdir plus a manifest and command log, not live memory. Live process migration (CRIU-style) is fragile by nature: it needs identical libraries and paths on the target. Capturing the workdir is what makes restore portable.

- **Content-addressed store.** Capture the working directory, plus an optional agent memory dir, so `memory_pointer` round-trips, into a CAS keyed by BLAKE3, alongside a manifest (env vars, tool list, memory pointer, working-dir root hash). The manifest is serialized canonically with stable ordering and neutralized timestamps and uid/gid, so the same input always yields the same `manifest_hash`. A canonical umask is pinned so captured file modes don't leak the ambient login umask. That is what makes restore byte-identical across hosts *and* across runtime tiers.
- **Encrypt.** Seal-encrypts the snapshot on the client before it touches Walrus. The t-of-n threshold is chosen at encryption time (`--threshold t`).
- **Store.** Writes to Walrus content-addressed blob storage via the resumable upload relay, receives a `blob_id`, and registers it against the Machine object.
- **Restore / move.** On any host and any runtime tier, pull the blob, decrypt with Seal if policy approves, rebuild the workdir from the CAS, and resume byte-identically. Drift is reported against recorded hashes, never hidden.

One `Runtime` trait exposes `exec` and a filesystem. The capture and verification paths are identical across all three tiers; only the isolation boundary swaps:

| Tier | Isolation | Notes |
|---|---|---|
| Local | none | drives the full loop and tests; runs anywhere; not for untrusted code |
| OCI | `runc`, read-only rootfs, tmpfs `/work`, network isolation | metadata service proven unreachable from inside |
| Firecracker | KVM kernel boundary, per-session microVM, in-guest agent over vsock | runs under the jailer (chroot, dropped privileges, cgroup v2) |

The Firecracker, OCI, and jailer tiers are verified on a real AWS KVM host: `firecracker_session` 8/8 plus a sudo-gated jailer test, `oci_session` 3/3, and `lib` 11/11.

### Machine package (Move)

- **`Machine` object:** an owned Sui object (`AddressOwner`) holding `owner`, current `blob_id`, `manifest_hash`, `provenance_head`, `parent`, and a policy reference. The owner alone mutates it; `create` and `retire` bookend its lifecycle.
- **`fork`:** clones a Machine from any checkpoint into a new Machine, recording the parent for provable on-chain lineage.
- **`grant` / `revoke`:** an allowlist plus time-limited expiry, enforced through the Seal access policy. Each appends a `GRANT` or `REVOKE` entry to the provenance chain. Revocation is forward-looking; it cannot un-see data already decrypted.
- **Provenance log:** append-only, hash-chained records whose head lives on the Machine object, so the chain is tamper-evident and on-chain timestamped.

### Seal access policy (Move)

`seal_approve*` functions on a shared `AccessPolicy` object define who may decrypt a Machine's checkpoints: owner-only by default, allowlist for a shared Machine, time-limited expiry for a collaborator. Revoke takes effect because the policy stops approving, not because data is deleted. The Seal committee threshold is fixed per checkpoint at encryption time.

### Attestation package (Move): optional Nautilus tier

A strictly additive tier that proves *which code* produced a checkpoint. It changes nothing about the Machine layout or provenance head, so a non-attested run is byte-identical.

- `register_enclave` verifies an AWS Nitro attestation document via `0x2::nitro_attestation` and pins the enclave's PCRs and ed25519 public key into a shared `EnclaveConfig`, once per reproducible build.
- `register_attested_command` cheaply ed25519-verifies a per-checkpoint signature over the manifest hash and emits a `CommandAttested` event.

This is live on testnet and mainnet; live `EnclaveConfig`s verify offline 4/4 on both networks. A tiny reproducible Nitro enclave (musl-static, about 6.5 MB `.eif`, identical PCRs across cache-cleared rebuilds) attests results. It does not run the agent. The agent stays in the Firecracker VM, which preserves portability and offline verification.

### Console (Walrus Site)

A static React 19 + Vite site served from Walrus that reads Sui objects and Walrus blobs directly. It shows the provenance head and log, checkpoint detail, `blob_id` badges, the verify action, live grant/revoke, and fork lineage. It has no privileged backend. Anything the Console can show, a third party can reproduce. That is what makes Reeg a neutral recorder rather than a vendor dashboard.

## The verification chain (the moat)

This is what makes a Reeg record provable offline from public Sui and Walrus data alone, with no Reeg backend in the loop.

<p align="center"><img src="/docs/diagrams/verification-flow.png" alt="Verification flow: an auditor reads the Machine object, walks the hash-chained provenance from the head, reads the checkpoint blob from Walrus by blob_id, checks blob_id equals hash of ciphertext, and checks manifest_hash and workdir_root_hash against the Machine object; all checks pass means VERIFIED, any mismatch means REJECTED, using public data only." width="820"></p>

1. The **manifest** describes the environment. Hash it to get `manifest_hash`.
2. The **snapshot** is content-addressed blob(s) on Walrus. The `blob_id` is the content hash, so the blob cannot be swapped without changing the id.
3. The **provenance log** is hash-chained: `H_n = hash(H_{n-1} || event)`. Each event carries a command plus input/output hashes (and grant/revoke entries).
4. The **Machine object** on Sui stores `owner`, current `blob_id`, `manifest_hash`, `provenance_head`, and `parent`, updated only through the Move package.

```
verify(machine, walrus):
  blob       = walrus.get(machine.blob_id)
  assert machine.blob_id == hash(blob)        # blob can't be swapped
  assert hash(manifest)  == machine.manifest_hash
  assert workdir_root_hash == manifest.root
  assert rewalk(provenance) == machine.provenance_head
  # public Sui + Walrus data only, Reeg offline
```

Tamper with the blob, the manifest, or any log event and at least one hash diverges, so verify fails. "It rejects a forged environment" is a demo beat, not a claim. Optionally, `@reeg/verify` also confirms the enclave's ed25519 signature and that the pinned PCRs match the trusted reproducible build, flagging all-zero debug-mode PCRs, which raises the bar from "this environment and history are authentic" to "this exact code produced this checkpoint."

## Trust boundaries

- **Trusted:** Sui consensus, Walrus availability proofs, the user's own client during encryption and decryption, and the threshold set of Seal key servers the user chooses.
- **Not trusted:** Reeg's own servers and the Console. They are conveniences; the record stands without them.
- **Out of scope for the core loop:** proving the CPU cycles of execution. Walrus is storage; execution runs on normal compute. The optional Nautilus tier narrows this gap by attesting which code produced a checkpoint, but it is not required to own, share, move, or prove an environment.

## Stack and tests

- **On-chain:** Sui, Move 2024 edition, live on mainnet and testnet.
- **SDKs:** `@mysten/sui` 2.17, `@mysten/walrus` 1.1.7, `@mysten/seal` 1.1.3, `@mysten/dapp-kit`, `bcs`.
- **Engine:** Rust, crates `snapshot` / `runtime` / `cli`. The `reeg` TS CLI shells to the `reeg-engine` binary and, on the Nitro host, the enclave vsock client.
- **Frontend:** React 19 + Vite Console (static Walrus Site); Next.js marketing site (reeg.xyz).
- **Tests, all green in CI:** Move 40/40 (including attestation with a real ed25519 vector); `@reeg/verify` 54/54; `@reeg/chain` 21/21; `@reeg/crypto` 8/8 (cross-language preimage match against the Move vector); engine on a real AWS KVM host with Firecracker 8/8 plus jailer, OCI 3/3, and lib 11/11.

## Honest constraints

On mainnet, a Seal-encrypted checkpoint needs a working key server, and there is currently no free public Open-mode Seal key server. So on mainnet, **encryption, storage, anchoring, and offline verification all work today; only decrypt (restore) is blocked** until a provider key server is live. The full encrypted checkpoint → restore → verify loop is proven end-to-end on testnet.

The hardened Firecracker, OCI, jailer, and Nautilus tiers require a Linux KVM and Nitro host. The Local tier and the full own/share/move/prove chain run anywhere.
