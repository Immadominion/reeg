# System Architecture

How Reeg is built, component by component, and how the pieces connect. Every Sui,
Walrus, Seal, and Nautilus fact here is verified in
[sui-tech-reference.md](sui-tech-reference.md).

## 1. The mental model: an operating system you own

Reeg takes "OS on Walrus" literally. A real OS is a filesystem, processes,
permissions, and persistent state. Reeg builds that as an ownable, verifiable thing:

| OS concept        | Built on            | What it gives you |
|-------------------|---------------------|-------------------|
| Disk / filesystem | Walrus blob         | environment state as content-addressed data you own |
| Kernel / perms    | Sui `Machine` object| who can read, fork, run, get paid; programmable |
| Encryption        | Seal                | encrypted on your machine before it leaves |
| Memory subsystem  | MemWal              | one syscall (agent memory) inside the OS |
| Processes         | runtime adapter     | wrap an existing runtime behind one interface; isolation tier is swappable |
| Syscall log       | Sui-anchored records| verifiable log of what the env held and what ran |
| Verified execution| Nautilus (optional) | prove the code that ran, not just the environment |

Our real technical contribution is the **Move `Machine` package** (object + fork +
grant/revoke + hash-chained provenance) and the **snapshot/restore engine**. We wrap
an existing runtime. We own the ownership and verifiability layer.

## 2. Components

```
                         ┌───────────────────────────────────────────────┐
                         │                  Sui (L1)                      │
                         │   Machine package (Move):                      │
                         │     Machine object, fork, grant/revoke,        │
                         │     provenance head, Blob references           │
                         │   Seal access policy (seal_approve)            │
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

### 2.1 Reeg runtime + snapshot engine (off-chain, client side)

Two concerns live here and they are deliberately decoupled: the **isolation boundary**
(how a live agent is contained) and the **snapshot engine** (how state is captured and
restored). The moat lives in the second one, so it is the part we build best and first.
Live process/memory migration across hosts (CRIU-style) is fragile by nature - it needs
identical libraries and paths on the target - which is exactly why we capture the
filesystem workdir plus a manifest and command log, not live memory.

- **Runtime adapter:** one interface (`Runtime` in `engine/crates/runtime`) exposing `exec`
  and a filesystem to the agent, with a swappable isolation tier behind it:
  - *Local (development) tier.* Host process execution in the working directory, with no
    isolation boundary. It drives the full run/checkpoint/restore loop and the tests, and is
    not for untrusted code; the isolation tiers below add the boundary without changing the
    capture or verification paths.
  - *Tier 1 (default): OCI container + OverlayFS.* A read-only lower layer
    (composefs/EROFS) plus a writable upper layer; the upper layer is the live delta the
    snapshot engine reads. Builds fast, runs anywhere, good enough for real use.
  - *Tier 2 (production hardening): Firecracker microVM.* Hard multi-tenant isolation
    with a per-session kernel, behind the same adapter, so it never touches the
    verification path. Added later by scope (see the build roadmap), not required by the
    core loop.
- **Snapshot engine (the SOTA core):** content-addressed store keyed by **BLAKE3**;
  capture the working filesystem as a Merkle tree over the OverlayFS upper layer plus an
  environment manifest (installed packages, env vars, tool list, memory pointer,
  working-dir root hash). Compute content-addressed deltas against the parent. Serialize
  the manifest canonically (stable ordering, neutralized timestamps and uid/gid) so the
  same input always yields the same `manifest_hash`. Where the kernel supports it,
  read-only layers carry **fs-verity** so corruption is detectable at the block level.
- **Encrypt:** Seal-encrypt the snapshot on the client before upload.
- **Store:** write to Walrus (WalrusFile API, resumable upload), receive `blob_id`,
  register against the Machine object.
- **Restore:** on any host, pull the blob, decrypt with Seal (if the caller's policy
  approves), rebuild the workdir from the content-addressed store, and resume. Report any
  drift against the recorded hashes rather than hiding it (NFR-8).

### 2.2 Machine package (on-chain, Move)

- `Machine` object: `owner`, current `blob_id`, `manifest_hash`, `provenance_head`,
  `parent` (for forks), and a policy reference.
- `fork`: clone into a new Machine object recording the parent for on-chain
  attribution.
- `grant` / `revoke`: capability-based access changes, enforced through the Seal
  policy.
- **Provenance log:** append-only, hash-chained records; the head lives on the
  Machine object so the chain is tamper-evident and on-chain timestamped.

### 2.3 Seal access policy (on-chain, Move)

- `seal_approve*` functions define who may decrypt a Machine's checkpoints.
- Default: owner-only. Shared Machine: allowlist. Collaborator: time-limited.
- Revoke takes effect because the policy stops approving, not because we delete data.

### 2.4 Console (Walrus Site)

- Static site served from Walrus. Reads Sui objects and Walrus blobs directly.
- Shows the provenance timeline, checkpoint detail, `blob_id` badges, the verify
  action, restore counts, live grant/revoke, and fork lineage.
- Has no privileged backend. Anything the console can show, a third party can
  reproduce. This is what makes Reeg a neutral recorder rather than a vendor dashboard.

### 2.5 MemWal (memory subsystem)

- Wired in as the agent-memory syscall, now against the shipped MemWal public-beta SDK.
  It is one subsystem inside the Machine, not the foundation. The `memory_pointer` in
  the manifest is part of the checkpoint, so memory is captured, restored, and verified
  with the rest of the environment. If MemWal is unavailable, the filesystem and
  environment story still stands on Walrus directly.

## 3. The verification chain (the moat)

This is what makes a Reeg record provable with our servers offline. See
[data-model.md](data-model.md) for the exact fields.

1. **Manifest** describes the environment. Hash it -> `manifest_hash`.
2. **Snapshot** is content-addressed blob(s) on Walrus; the `blob_id` is the content
   hash, so the blob cannot be swapped without changing the id.
3. **Provenance log** is hash-chained: `H_n = hash(H_{n-1} || event)`. Each event
   carries a command plus input/output hashes.
4. **Machine object** on Sui stores `owner`, current `blob_id`, `manifest_hash`,
   `provenance_head`, and `parent`, updated only through the Move package.
5. **Verify (anyone, no Reeg server):** pull `blob_id` from Walrus, recompute
   `manifest_hash` and the working-dir root hash, re-walk the provenance chain to
   `provenance_head`, and check all three against the Machine object. Match means the
   environment and its history are exactly what was claimed; `restore()` then mounts
   it.
6. **Adversarial guarantee:** tamper with the blob, the manifest, or any log event
   and at least one hash diverges, so verify fails. "It rejects a forged environment"
   is a demo beat, not a claim.

## 4. Trust boundaries

- **Trusted:** Sui consensus, Walrus availability proofs, the user's own client
  during encryption/decryption, and the threshold set of Seal key servers the user
  chooses.
- **Not trusted:** Reeg's own servers and the Console. They are conveniences. The
  record stands without them.
- **Out of scope for the core loop:** proving the CPU cycles of execution. Walrus is
  storage; execution runs on normal compute. We make the *environment* owned and
  verifiable, not the compute. Nautilus (now on mainnet) is the optional tier that
  closes this gap when a run needs attested execution; it is not required to own,
  share, move, or prove an environment.

## 5. Scale and performance posture

- **Owned objects, not shared, on the hot path.** Machine ownership uses
  `AddressOwner` so common operations take Sui's fast path and avoid consensus
  ordering. Reserve shared objects for genuinely shared Machines.
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
record-keeping. The EU AI Act's logging duties for high-risk AI systems (Article 12)
begin applying **2 August 2026** and require automatically generated, tamper-evident
records that someone other than the operator can examine, retained for a minimum
period (at least six months for the high-risk classes). That is exactly the shape of
what Reeg already produces, so we treat compliance as a first-class concern, not a
bolt-on.

The important design rule: **the evidence layer adds no new primitives and no new
trusted party.** It is a read and an export over the same hash-chained provenance and
content-addressed checkpoints that everything else uses.

- **Tamper-evident record (have it):** the hash-chained provenance log anchored to
  `provenance_head` on Sui, plus content-addressed checkpoints on Walrus, are already
  an automatically generated, independently verifiable record. Nothing about checking
  it requires a live or honest Reeg service.
- **Evidence export (FR-9):** a portable manifest an auditor can keep - Machine id,
  per-checkpoint `blob_id`s and `manifest_hash`es, the provenance entries with their
  `entry_hash` chain, and a command-log digest - so the record survives outside both
  Reeg and the Console.
- **Retention:** retention is a Walrus storage-epoch policy (the operator keeps the
  blobs paid through the required window) plus the permanent on-chain provenance head.
  The roadmap's retire/lifecycle controls (FR-6) let an operator manage cost while
  meeting the minimum-retention duty.
- **Attested execution (optional, deeper):** for runs that must prove *what code ran*,
  a Nautilus PCR-bound signature attaches to the relevant `Command` provenance event.
  This strengthens the evidence from "this environment and history are authentic" to
  "this exact code ran on this input," for the subset of high-risk runs that need it.

What this is not: Reeg is still not a regulated PHI or classified-data custody vault
(Seal is not designed for data whose mere existence is a breach). The compliance value
is auditable, tamper-evident *records of agent work*, not custody of the most sensitive
data classes. Say that plainly to compliance buyers.
</content>
