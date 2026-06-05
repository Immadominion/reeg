import { Transaction } from '@mysten/sui/transactions';
import { fromHex, normalizeSuiAddress, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';

// Canonical 32-byte object id as bytes. Mirrors @reeg/crypto canonicalHex so the identity the
// key server sees in seal_approve is byte-identical to the one a checkpoint was encrypted under,
// regardless of how the id string was written (short, odd-length, or already canonical).
function canonicalBytes(id: string): Uint8Array {
  return fromHex(normalizeSuiAddress(id).slice(2));
}

/** Inputs to the atomic checkpoint anchor. `blobId` is the Walrus blob id as u256, the same
 *  value the storage adapter returns from `blobIdToInt`. */
export interface CheckpointArgs {
  packageId: string;
  machineId: string;
  blobId: bigint;
  manifestHash: Uint8Array;
  payloadHash: Uint8Array;
}

/**
 * Append the checkpoint call to `tx`. A single `register_checkpoint` Move call pins the blob
 * and manifest hash, appends the provenance entry, and advances the head, all atomically
 * inside that one call. The Clock is the shared 0x6 object that supplies the timestamp.
 */
export function addRegisterCheckpoint(tx: Transaction, args: CheckpointArgs): Transaction {
  tx.moveCall({
    target: `${args.packageId}::machine::register_checkpoint`,
    arguments: [
      tx.object(args.machineId),
      tx.pure.u256(args.blobId),
      tx.pure.vector('u8', args.manifestHash),
      tx.pure.vector('u8', args.payloadHash),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** A fresh transaction that registers one checkpoint. */
export function buildRegisterCheckpoint(args: CheckpointArgs): Transaction {
  return addRegisterCheckpoint(new Transaction(), args);
}

/** Create a Machine and transfer it to the caller. An ID argument serializes as a 32-byte
 *  address, so the policy id is passed through `pure.address`. */
export function buildCreateMachine(packageId: string, policyId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::machine::create_owned`,
    arguments: [tx.pure.address(policyId)],
  });
  return tx;
}

/** Retire a Machine: append a permanent end-of-life marker to its provenance chain. Owner only. */
export function buildRetire(packageId: string, machineId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::machine::retire`,
    arguments: [tx.object(machineId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}

/** Fork a Machine from its latest checkpoint, recording provable lineage to the parent. */
export function buildFork(
  packageId: string,
  parentMachineId: string,
  policyId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::machine::fork_owned`,
    arguments: [tx.object(parentMachineId), tx.pure.address(policyId)],
  });
  return tx;
}

/**
 * Build the owner-only `seal_approve` call for a Machine. This is never executed; its bytes are
 * evaluated in a Seal key server dry run to authorize decryption. The identity is the Machine's
 * object-id bytes, matching the on-chain `id == machine.id_bytes()` check.
 */
export function buildSealApprove(packageId: string, machineId: string): Transaction {
  const idBytes = canonicalBytes(machineId);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::policy::seal_approve`,
    arguments: [tx.pure.vector('u8', idBytes), tx.object(machineId)],
  });
  return tx;
}

// The Seal identity for a shareable checkpoint: the policy object id bytes followed by the
// Machine id bytes, each canonical 32 bytes. Matches @reeg/crypto toPolicyIdentity and
// reeg::access::expected_identity byte for byte.
function policyIdentity(policyId: string, machineId: string): Uint8Array {
  const policy = canonicalBytes(policyId);
  const machine = canonicalBytes(machineId);
  const out = new Uint8Array(policy.length + machine.length);
  out.set(policy, 0);
  out.set(machine, policy.length);
  return out;
}

/** Create a shareable Machine together with its shared AccessPolicy in one transaction. The
 *  caller reads both created object ids from the transaction's object changes. */
export function buildCreateSharedMachine(packageId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${packageId}::access::create_shared_machine`, arguments: [] });
  return tx;
}

/** Owner-only: grant or update `grantee`'s access on the Machine's policy. `expiryMs` of 0 means
 *  no expiry. Rights is a bitfield (bit 0 view, bit 1 restore). */
export function buildGrant(
  packageId: string,
  machineId: string,
  policyId: string,
  grantee: string,
  rights: number,
  expiryMs: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access::grant`,
    arguments: [
      tx.object(machineId),
      tx.object(policyId),
      tx.pure.address(grantee),
      tx.pure.u8(rights),
      tx.pure.u64(expiryMs),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** Owner-only: revoke `grantee`'s access. Forward-looking; cannot recall already-fetched keys. */
export function buildRevoke(
  packageId: string,
  machineId: string,
  policyId: string,
  grantee: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access::revoke`,
    arguments: [
      tx.object(machineId),
      tx.object(policyId),
      tx.pure.address(grantee),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

/** Build the allowlist `seal_approve` call against a shared AccessPolicy. Never executed; the
 *  key server dry-runs it with the grantee as sender. The identity is policyId ++ machineId. */
export function buildSealApproveAllowlist(
  packageId: string,
  policyId: string,
  machineId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access::seal_approve_allowlist`,
    arguments: [tx.pure.vector('u8', policyIdentity(policyId, machineId)), tx.object(policyId)],
  });
  return tx;
}

/** Build the time-limited `seal_approve_until` call against a shared AccessPolicy. The Clock is
 *  the shared 0x6 object; the policy enforces the grant's expiry. Used by the grantee restore
 *  path (it also authorizes non-expiring grants, so it is the default). */
export function buildSealApproveUntil(
  packageId: string,
  policyId: string,
  machineId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::access::seal_approve_until`,
    arguments: [
      tx.pure.vector('u8', policyIdentity(policyId, machineId)),
      tx.object(policyId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}
