# Data Model

The objects, records, and hashes that make a Reeg Machine ownable and provable.
Field names here are the contract between the Move package, the snapshot engine, and
the Console. Verified Sui/Walrus/Seal shapes are in
[sui-tech-reference.md](sui-tech-reference.md).

## 1. On-chain: the `Machine` object (Move)

The kernel of one computing environment (typically an agent run). Owned by an address so it takes Sui's fast path.

```
Machine (Sui object, key + store)
├── id: UID                       // unique object id
├── owner: address                // current owner (native ownership)
├── current_blob_id: u256         // Walrus blob_id of the latest checkpoint (ciphertext)
├── manifest_hash: vector<u8>     // hash of the environment manifest in that checkpoint
├── provenance_head: vector<u8>   // head of the hash-chained provenance log
├── checkpoint_count: u64         // number of checkpoints taken
├── parent: Option<ID>            // the Machine this was forked from, if any
├── policy_id: ID                 // the Seal access policy object governing decryption
└── created_at_epoch: u32
```

Notes:

- `current_blob_id` is a content hash, so it cannot point at swapped content silently.
- `provenance_head` makes the whole history tamper-evident from a single on-chain field.
- `parent` gives forks provable lineage and attribution.
- The object is mutated only through the Machine package, which keeps the provenance
  log append-only.

### Companion: the provenance log

The full log is hash-chained off-chain (it can be large), with only the head anchored
on-chain. Each entry:

```
ProvenanceEntry
├── seq: u64
├── prev_hash: vector<u8>          // H_{n-1}
├── event_type: enum               // Checkpoint=0 | Command=1 | Grant=2 | Revoke=3 | Fork=4 | Retire=5
├── payload_hash: vector<u8>       // hash of the event payload (e.g. command + io hashes)
├── blob_id: Option<u256>          // set for Checkpoint events
├── timestamp_ms: u64
└── entry_hash: vector<u8>         // H_n = hash(prev_hash || event_type || payload_hash || ...)
```

Anchoring: when a checkpoint is registered, the PTB updates `provenance_head` on the
Machine object to the new `entry_hash`. The chain is verifiable end to end against
that single head.

## 2. On-chain: the Seal access policy (Move)

A separate object + `seal_approve*` functions governing who may decrypt a Machine's
checkpoints. Default owner-only:

```
move
entry fun seal_approve(id: vector<u8>, machine: &Machine, ctx: &TxContext) {
    // id encodes the machine id; approve only if caller is the owner
    assert!(machine.owner == ctx.sender(), ENoAccess);
}
```

Variants planned: `seal_approve_allowlist` (shared Machine), `seal_approve_until`
(time-limited collaborator). Revoke = update the policy object so future
`seal_approve` calls abort for that address. No data is deleted; access simply stops.

## 3. Off-chain: the checkpoint blob (Walrus)

What actually gets stored, after Seal encryption, as a single Walrus blob:

```
Checkpoint (plaintext, before Seal encryption)
├── manifest
│   ├── packages: [{name, version}]
│   ├── env_vars: {key: value}          // secrets redacted or referenced, not inlined
│   ├── tools: [string]
│   ├── memory_pointer: blob_id | null  // MemWal / memory subsystem reference
│   └── workdir_root_hash: vector<u8>   // Merkle root of the working directory
├── filesystem_delta                    // content-addressed changed chunks since parent
└── meta
    ├── machine_id
    ├── parent_blob_id: u256 | null
    └── created_at_ms
```

- `manifest_hash` (on the Machine object) = hash of the canonicalized `manifest`.
- `workdir_root_hash` lets a verifier confirm file contents without trusting us.
- The blob is Seal-encrypted before upload, so the public Walrus blob is ciphertext.
  The `blob_id` (content hash of the ciphertext) is what the Machine object stores.

## 4. The verification chain, as data

```
Walrus blob (ciphertext)
   │  blob_id = contentHash(ciphertext)        ← on Machine.current_blob_id
   ▼ (decrypt via Seal if policy approves)
Checkpoint plaintext
   │  hash(canonical manifest) = manifest_hash ← on Machine.manifest_hash
   │  merkleRoot(workdir)      = workdir_root_hash
   ▼
Provenance log
   │  re-walk H_0..H_n         = provenance_head ← on Machine.provenance_head
   ▼
Machine object (Sui)
      owner, current_blob_id, manifest_hash, provenance_head, parent
```

A verifier needs only: the Machine object id (public), Walrus read access (public),
and, to read plaintext, a Seal policy approval. The integrity check (do the hashes
match the on-chain anchors) needs no decryption at all and no Reeg server.

## 5. What is intentionally not modeled in the MVP

- **Full process / memory state (CRIU-style).** Out of scope. The manifest plus
  filesystem is enough to resume the target agent workloads.
- **Billing / metering records.** Mocked for the MVP; designed as off-chain usage
  events that can later settle on-chain.
- **Nautilus execution attestations.** Nautilus is on mainnet, but attested execution
  stays an optional later tier sequenced by scope; when enabled it attaches a PCR-bound
  signature to provenance `Command` events, deepening the compliance and proof story.
</content>
