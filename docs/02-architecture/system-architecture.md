# System Architecture

How Reeg is built, component by component, and how the pieces connect. Every Sui,
Walrus, Seal, and Nautilus fact here is verified in
[sui-tech-reference.md](sui-tech-reference.md).

Reeg is **live on Sui mainnet**. Mainnet package
`0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e` (upgraded from the
original `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3` to add the
attestation module); testnet package
`0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`. A measured create +
encrypted checkpoint (1 epoch, including the Walrus upload-relay tip) costs ~0.0099 SUI +
~0.0119 WAL on mainnet. Reeg is **GitHub for AI agents**: it snapshots an agent's environment into
a record you own, share, move, and prove.

## 1. The mental model: version control for agent environments

Reeg takes "OS on Walrus" literally. A real OS is a filesystem, processes,
permissions, and persistent state. Reeg builds that as an ownable, verifiable thing:

| OS concept        | Built on            | What it gives you |
|-------------------|---------------------|-------------------|
| Disk / filesystem | Walrus blob         | environment state as content-addressed data you own |
| Kernel / perms    | Sui `Machine` object| who can read, fork, run, get paid; programmable |
| Encryption        | Seal                | encrypted on your machine before it leaves |
| Memory subsystem  | agent memory dir    | optional agent memory captured alongside the filesystem |
| Processes         | `Runtime` trait     | one interface; the isolation tier (Local / OCI / Firecracker) is swappable |
| Syscall log       | Sui-anchored records| verifiable log of what the env held and what ran |
| Verified execution| Nautilus (optional) | prove the code that produced a checkpoint, not just the environment |

Our real technical contribution is the **Move `Machine` package** (object + fork +
grant/revoke + hash-chained provenance) and the **snapshot/restore engine**. We wrap
an existing runtime. We own the ownership and verifiability layer.

## 2. Components

```
                         ┌───────────────────────────────────────────────┐
                         │                  Sui (L1, mainnet)             │
                         │   Machine package (Move):                      │
                         │     Machine object, fork, grant/revoke,        │
                         │     provenance head, Blob references           │
                         │   AccessPolicy (seal_approve)                  │
                         │   attestation: EnclaveConfig, CommandAttested  │
                         └───────▲───────────────────────▲───────────────┘
                                 │ register / verify      │ policy dry-run
                                 │                        │
   ┌──────────────┐   exec    ┌──┴───────────┐  encrypt  ┌┴──────────┐  store  ┌──────────┐
   │   AI agent   │──────────▶│ Reeg runtime │──────────▶│   Seal    │────────▶│  Walrus  │
   │ (any client) │           │  + snapshot  │  (client  │ (encrypt) │ blob_id │ (storage)│
   └──────────────┘           │    engine    │   side)   └───────────┘         └──────────┘
                              └──────┬───────┘                                      │
                                     │ restore (pull blob, decrypt, mount)          │
                                     └──────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  Reeg Console (Walrus Site): machines, provenance timeline, verify, restore,   │
   │  grant/revoke, fork. Reads Sui + Walrus directly; no trusted Reeg backend.     │
   └──────────────────────────────────────────────────────────────────────────────┘
```

The Rust engine and the TypeScript client meet at exactly **one artifact boundary**: a
manifest plus content-addressed files. The engine never imports a chain or storage client;
the TS side never reaches into snapshot internals. That boundary is what lets the same
captured environment cross hosts *and* runtime tiers byte-identically.

### 2.1 Reeg runtime + snapshot engine (off-chain, client side)

Two concerns live here and they are deliberately decoupled: the **isolation boundary**
(how a live agent is contained) and the **snapshot engine** (how state is captured and
restored). The moat lives in the second one, so it is the part we build best and first.
Live process/memory migration across hosts (CRIU-style) is fragile by nature — it needs
identical libraries and paths on the target — which is exactly why we capture the
filesystem workdir plus a manifest and command log, not live memory.

- **One `Runtime` trait, three tiers.** A single interface (`Runtime` in
  `engine/crates/runtime`) exposes `exec` and a filesystem to the agent. The capture and
  verification paths are **identical across all three tiers** — the isolation boundary is
  the only thing that swaps:
  - *Local (development) tier.* Host process execution in the working directory, with no
    isolation boundary. It drives the full run/checkpoint/restore loop and the tests, and is
    not for untrusted code. It runs anywhere.
  - *OCI container tier.* `runc` with a read-only rootfs, a per-session tmpfs `/work`, and
    network isolation — proven by an unreachable cloud metadata service from inside the
    container. Builds fast, runs anywhere with a container runtime.
  - *Firecracker microVM tier.* KVM kernel-boundary isolation: a per-session microVM with a
    read-only rootfs and per-session tmpfs, an in-guest agent reached over **vsock** using a
    length-prefixed framed protocol. Phase M hardening is **19/19 complete and verified on a
    real AWS KVM host**, including running the Firecracker VMM under the **jailer** (chroot +
    privileges dropped to an unprivileged uid/gid + cgroup v2). On the KVM host:
    `firecracker_session` 8/8 plus a sudo-gated jailer test, `oci_session` 3/3, `lib` 11/11.
- **Snapshot engine (the SOTA core):** a content-addressed store (CAS) keyed by **BLAKE3**.
  Capture the working directory (plus an optional agent memory dir, so `memory_pointer`
  round-trips) into the content-addressed store keyed by BLAKE3, alongside an environment
  manifest (env vars, tool list,
  memory pointer, working-dir root hash). Serialize the manifest canonically (stable
  ordering, neutralized timestamps and uid/gid) so the same input always yields the same
  `manifest_hash`. A **canonical umask is pinned** so captured file modes don't leak the
  ambient login umask — that is what makes restore byte-identical not just across hosts but
  across runtime tiers.
- **Encrypt:** Seal-encrypt the snapshot on the client, before it ever touches Walrus. The
  t-of-n threshold is chosen at encryption time (`reeg checkpoint --threshold t`).
- **Store:** write to Walrus (content-addressed blob storage, resumable upload via the
  upload relay), receive `blob_id`, register against the Machine object.
- **Restore / move:** on **any** host and **any** runtime tier, pull the blob, decrypt with
  Seal (if the caller's policy approves), rebuild the workdir from the CAS, and resume —
  byte-identically, because the content is content-addressed and the capture is
  deterministic. Report any drift against the recorded hashes rather than hiding it.

### 2.2 Machine package (on-chain, Move)

- `Machine` object: an **owned** Sui object (`AddressOwner`) with `owner`, current
  `blob_id`, `manifest_hash`, `provenance_head`, `parent` (for forks), and a policy
  reference. The owner alone mutates it; `create` / `retire` bookend its lifecycle.
- `fork`: clone a Machine from any checkpoint into a new Machine object, recording the
  parent for provable on-chain lineage.
- `grant` / `revoke`: allowlist plus time-limited expiry, enforced through the Seal access
  policy; each append a `GRANT` / `REVOKE` entry to the provenance chain. Revocation is
  forward-looking — it cannot un-see data already decrypted.
- **Provenance log:** append-only, hash-chained records; the head lives on the Machine
  object so the chain is tamper-evident and on-chain timestamped.

### 2.3 Seal access policy (on-chain, Move)

- `seal_approve*` functions on a shared `AccessPolicy` object define who may decrypt a
  Machine's checkpoints.
- Default: owner-only. Shared Machine: allowlist. Collaborator: time-limited expiry.
- Revoke takes effect because the policy stops approving, not because we delete data.
- The Seal committee threshold (t-of-n) is fixed at **encryption** time, per checkpoint.

### 2.4 Attestation package (on-chain, Move) — optional Nautilus tier

A strictly additive tier that proves *which code* produced a checkpoint. It changes nothing
about `machine.move`'s layout or provenance head, so a non-attested run is byte-identical.

- `register_enclave`: verifies an AWS Nitro attestation document via
  `0x2::nitro_attestation` and pins the enclave's PCRs plus its ed25519 public key into a
  shared `EnclaveConfig` (once per reproducible build).
- `register_attested_command`: cheaply ed25519-verifies a per-checkpoint signature over the
  manifest hash and emits a `CommandAttested` event.
- Live on **testnet and mainnet**; live `EnclaveConfig`s verified offline 4/4 on both
  networks. See §4 for the trust model and §2.6 for the enclave itself.

### 2.5 Console (Walrus Site)

- Static React 19 + Vite site served from Walrus. Reads Sui objects and Walrus blobs
  directly.
- Shows the provenance head and log, checkpoint detail, `blob_id` badges, the verify action,
  live grant/revoke, and fork lineage.
- Has no privileged backend. Anything the console can show, a third party can reproduce.
  This is what makes Reeg a neutral recorder rather than a vendor dashboard.

### 2.6 Nautilus enclave (off-chain, attestation only)

- A tiny **reproducible** AWS Nitro enclave (musl-static, ~6.5 MB `.eif`; two cache-cleared
  rebuilds produce identical PCRs). It derives an ed25519 key from NSM entropy, obtains a
  Nitro attestation document embedding that key, and signs a checkpoint's manifest hash over
  a **frozen preimage**.
- **The enclave attests results; it does not run the agent.** The agent stays in the
  Firecracker VM, which preserves portability and offline verification. The enclave only
  adds a signature that pins the code identity to a checkpoint.
- `reeg checkpoint --attest` runs on the AWS Nitro host; the engine reaches the local
  enclave over vsock, and the operator's key lives on that host.

## 3. The verification chain (the moat)

This is what makes a Reeg record provable offline from public Sui + Walrus data alone,
with no Reeg backend in the loop. See [data-model.md](data-model.md) for the exact fields.

1. **Manifest** describes the environment. Hash it -> `manifest_hash`.
2. **Snapshot** is content-addressed blob(s) on Walrus; the `blob_id` is the content
   hash, so the blob cannot be swapped without changing the id.
3. **Provenance log** is hash-chained: `H_n = hash(H_{n-1} || event)`. Each event
   carries a command plus input/output hashes (and grant/revoke entries).
4. **Machine object** on Sui stores `owner`, current `blob_id`, `manifest_hash`,
   `provenance_head`, and `parent`, updated only through the Move package.
5. **Verify (anyone, no Reeg server):** pull `blob_id` from Walrus, recompute
   `manifest_hash` and the working-dir root hash, re-walk the provenance chain to
   `provenance_head`, and check all three against the Machine object — using **public Sui +
   Walrus data only**. Match means the environment and its history are exactly what was
   claimed; `restore()` then mounts it.
6. **Adversarial guarantee:** tamper with the blob, the manifest, or any log event
   and at least one hash diverges, so verify fails. "It rejects a forged environment"
   is a demo beat, not a claim.
7. **Optional attestation check:** `@reeg/verify` additionally confirms the enclave's
   ed25519 signature and that the pinned PCRs match the trusted reproducible build — and
   flags all-zero debug-mode PCRs. This raises the bar from "this environment and history
   are authentic" to "this exact code produced this checkpoint," without changing the
   base verification path.

## 4. Trust boundaries

- **Trusted:** Sui consensus, Walrus availability proofs, the user's own client
  during encryption/decryption, and the threshold set of Seal key servers the user
  chooses.
- **Not trusted:** Reeg's own servers and the Console. They are conveniences. The
  record stands without them.
- **Out of scope for the core loop:** proving the CPU cycles of execution. Walrus is
  storage; execution runs on normal compute. We make the *environment* owned and
  verifiable, not the compute. The **Nautilus attestation tier (live on testnet and
  mainnet)** narrows this gap by attesting *which code* produced a checkpoint; it is
  optional and additive, and is not required to own, share, move, or prove an environment.

## 5. Scale and performance posture

- **Owned objects, not shared, on the hot path.** Machine ownership uses
  `AddressOwner` so common operations take Sui's fast path and avoid consensus
  ordering. Reserve shared objects for genuinely shared Machines (the `AccessPolicy`,
  `EnclaveConfig`).
- **PTBs for atomic multi-step actions** (snapshot register + provenance append +
  policy update in one transaction).
- **Checkpoint on commit boundaries, not continuously.** Walrus is durable, not a
  low-latency disk. Keep hot working state local; push content-addressed deltas on
  meaningful boundaries.
- **Stateless services scale horizontally.** Seal key servers and Reeg's optional
  helper services (upload relay, indexer) hold no authoritative state; the
  authoritative state is on Sui and Walrus.
- **Read scaling via aggregators and a custom indexer.** The Console reads through
  Walrus aggregators and a Sui custom indexer, both of which scale independently of
  any Reeg backend.

## 6. Compliance and evidence

The one demand signal that is concrete rather than aspirational is regulatory
record-keeping. The EU AI Act's record-keeping duties for high-risk AI systems
(Article 12) call for automatically generated, tamper-evident records that are
retained over the system's lifecycle. The tamper-evident provenance and evidence
export Reeg already produces **map to** the shape of those Article 12 record-keeping
duties, so we treat compliance as a first-class concern, not a bolt-on. (This is
positioning, not legal advice — Reeg does not make anyone compliant, and we keep the
claims honest.)

The important design rule: **the evidence layer adds no new primitives and no new
trusted party.** It is a read and an export over the same hash-chained provenance and
content-addressed checkpoints that everything else uses.

- **Tamper-evident record (have it):** the hash-chained provenance log anchored to
  `provenance_head` on Sui, plus content-addressed checkpoints on Walrus, are already
  an automatically generated, independently verifiable record. Nothing about checking
  it requires a live or honest Reeg service.
- **Evidence export (`reeg evidence` / `reeg audit`):** a portable manifest an auditor can
  keep — Machine id, per-checkpoint `blob_id`s and `manifest_hash`es, the provenance entries
  with their `entry_hash` chain, and a command-log digest — so the record survives outside
  both Reeg and the Console.
- **Retention:** retention is a Walrus storage-epoch policy (`--epochs`) plus the permanent
  on-chain provenance head. The retire/lifecycle controls let an operator manage cost while
  setting whatever retention window their own record-keeping policy calls for.
- **Attested execution (optional, deeper):** for runs that must prove *what code ran*, the
  Nautilus enclave's PCR-bound ed25519 signature attaches to the relevant checkpoint via
  `CommandAttested`. This strengthens the evidence from "this environment and history are
  authentic" to "this exact code produced this checkpoint," for the subset of high-risk runs
  that need it.

What this is not: Reeg is still not a regulated PHI or classified-data custody vault
(Seal is not designed for data whose mere existence is a breach). The compliance value
is auditable, tamper-evident *records of agent work*, not custody of the most sensitive
data classes. Say that plainly to compliance buyers.

## 7. Honest constraints

- **Mainnet decrypt waits on a Seal key server.** A Seal-encrypted checkpoint needs a
  working key server. On mainnet there is currently no free public Open-mode Seal key server
  (the decentralized committee server is "available soon"; independent providers run
  Permissioned mode requiring signup, and the Ruby Nodes free-tier key currently returns 403
  from their gateway — a provider-side activation matter, not Reeg's code). So on mainnet,
  **encryption + storage + anchor + offline verify all work; only decrypt (restore) is
  blocked** until a provider key server is live. The full encrypted
  checkpoint -> restore -> verify loop is proven end-to-end on **testnet**.
- **The hardened tiers need the right host.** The Firecracker, OCI, jailer, and Nautilus
  tiers require a Linux KVM + Nitro host (an AWS box). The Local tier and the full
  own/share/move/prove chain run anywhere.
- **`--attest` is host-bound.** `reeg checkpoint --attest` runs on the AWS Nitro host (the
  engine reaches the local enclave over vsock), with the operator's key on that host.

## 8. Stack and tests

- **On-chain:** Sui, Move 2024 edition. Live on mainnet and testnet.
- **SDKs:** `@mysten/sui` 2.17, `@mysten/walrus` 1.1.7, `@mysten/seal` 1.1.3,
  `@mysten/dapp-kit`, `bcs` — all at npm latest.
- **Engine:** Rust 1.95, crates `snapshot` / `runtime` / `cli`. The `reeg` TS CLI shells to
  the `reeg-engine` binary for snapshot/restore and, on the Nitro host, the enclave vsock
  client.
- **CLI verbs:** `create`, `run`, `checkpoint` (`--epochs`, `--threshold`, `--attest`,
  `--enclave-config`), `restore`, `fork`, `grant`, `revoke`, `retire`, `verify`,
  `evidence`, `audit`, `enclave register`.
- **Frontend:** React 19 + Vite 8 Console (static Walrus Site); Next 16 marketing site
  (reeg.xyz).
- **Monorepo / tooling:** pnpm 10 + Turborepo, Biome lint/format, Sui CLI 1.73.1, Walrus
  CLI.
- **Tests (all green in CI across TypeScript, Rust, and Move jobs):** Move 40/40 (incl.
  attestation with a real ed25519 vector); `@reeg/verify` 54/54; `@reeg/chain` 21/21;
  `@reeg/crypto` 8/8 (cross-language preimage match vs the Move vector); engine on KVM
  `firecracker_session` 8/8 + jailer + `oci_session` 3/3 + `lib` 11/11.
</invoke>
