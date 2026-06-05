# Sharing design (build-roadmap Phase I)

How Reeg shares an environment: from owner-only to allowlist to time-limited grants, without ever
weakening the offline-verifiability invariant ([NFR-1](../02-architecture/security-and-threat-model.md)).
This records the decision and the why; the code is in `move/sources/access.move`, `packages/chain`,
`packages/crypto`, `packages/sdk`, and `packages/verify`.

## The decisive constraint

A Seal key server decides whether to release a key by simulating the `seal_approve` call with the
**caller (grantee) as sender**, and the Move VM enforces Sui's owned-object input rules in that
simulation. A `Machine` is an owned object, so a non-owner can never reference it as an input.
Therefore grant state cannot live on the Machine: it must live in a **shared** object the grantee
can reference. Everything below follows from that.

## Shape

- The `Machine` stays owned and unchanged (its 9-field struct, the layout-guard test, and the
  owner-only `reeg::policy::seal_approve` are all frozen for back-compat).
- A new module `reeg::access` defines a **shared, versioned `AccessPolicy`** created 1:1 with each
  shareable Machine. The Machine's existing `policy_id` field points at it (the field was always
  intended for exactly this). `create_shared_machine` mints both in one transaction: it creates the
  policy UID first so its id can be the Machine's `policy_id`, then binds the Machine's id back into
  the policy, so the two reference each other atomically with no `Option` and no separate bind step.
- `AccessPolicy { id, machine_id, owner, version, grants: VecMap<address, Grant> }`, where
  `Grant { rights: u8, expiry_ms: u64 }` (rights bit 0 view, bit 1 restore; `expiry_ms == 0` means
  no expiry). The owner starts self-granted, so the owner decrypts through the same path a grantee
  does.

## Identity

A shareable checkpoint is encrypted under the Seal identity `policy_id_bytes ++ machine_id_bytes`
(`@reeg/crypto` `toPolicyIdentity`, mirrored on chain by `reeg::access::expected_identity`). The
policy object id namespaces the key so a key for one policy cannot authorize another; the machine
id suffix double-binds it to one Machine. The two `seal_approve` variants require the identity to
equal exactly that, then check membership (`seal_approve_allowlist`) and, additionally, expiry
against the `Clock` (`seal_approve_until`). Committee/threshold (t-of-n) needs **no** policy
variant: it is encrypt-time `SealClient` config (the server set and threshold), and the same
allowlist policy authorizes it while the key servers enforce the threshold.

## Provenance and offline verification

`grant` and `revoke` append a GRANT (type 2) or REVOKE (type 3) entry to the Machine's provenance
chain via `machine::register_grant` / `register_revoke`. These reuse the frozen `compute_entry_hash`
with `seq = checkpoint_count` (shared with the next checkpoint, never consumed), `blob_id = 0`, and
an empty `manifest_hash`; they advance the head only and leave `checkpoint_count`,
`current_blob_id`, and `manifest_hash` untouched. So the verifier's checkpoint count and its
`0..n-1` sequence stay exactly as the checkpoints left them, and the only verifier change is
additive: it also reads `AccessGranted`/`AccessRevoked` events and merges them into the replay.

Because a grant or revoke shares a seq with the next checkpoint, the verifier orders the merged
chain by **hash linkage** (each event carries `prev_head` and `new_head`), not by seq. Dropping or
tampering with any entry breaks the head replay, so the sharing history is as tamper-evident and as
offline-reconstructable as the checkpoint history.

## Honest limitations

- **Revocation is forward-looking, and weaker than it first sounds.** Every checkpoint of a Machine
  is encrypted under one identity (policy id ++ machine id), so a grantee who fetched the decryption
  key while authorized can decrypt that Machine's checkpoints past *and future*, even after a revoke;
  revoke only stops them fetching the key again. True forward secrecy would need per-checkpoint key
  rotation (a different identity per snapshot), which is future work. The CLI and Console say this
  plainly on revoke rather than overpromising.
- **A key server's fullnode can briefly lag a just-mutated shared policy**, so a legitimate restore
  immediately after a grant or revoke may transiently fail (`InvalidParameterError`). The restore
  path retries transient errors and fails fast only on a definitive `NoAccess`.
- **Forked-child restore is cross-identity.** A fork inherits the parent's checkpoint pointer, whose
  ciphertext is under the parent policy identity, so restoring inherited state needs the parent
  policy. Sharing a forked child's own future checkpoints works; this is unchanged from Phase G.
- **Committee/threshold is verified by construction, not yet live on testnet**, because the testnet
  config currently has one reachable independent key server. The threshold flows from config through
  `SealClient` and `crypto.encrypt`; a t-of-n>1 live test needs a second reachable key server.

## Validated on testnet

On the published testnet package (see `config/testnet.json`): owner checkpoint and restore
byte-identical; a second address granted `restore` decrypts and restores byte-identical; after
revoke that address gets a clean `NoAccess` while the owner is unaffected; a `--until` grant works
inside its window and is denied after it; `reeg verify` passes offline with the GRANT and REVOKE
entries in the chain.
