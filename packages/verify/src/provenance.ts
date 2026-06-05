import { bcs } from '@mysten/bcs';
import { blake2b256, concatBytes, toHex } from './hash';

/** Provenance event-type tags, matching the Move package (machine.move). The values are a
 *  frozen cross-language contract, so they never change. */
export const EVENT_CHECKPOINT = 0;
export const EVENT_COMMAND = 1;
export const EVENT_GRANT = 2;
export const EVENT_REVOKE = 3;
export const EVENT_FORK = 4;
export const EVENT_RETIRE = 5;

/**
 * One provenance entry, as emitted by the Machine package's CheckpointRegistered event. The
 * verifier reconstructs the off-chain log from these and replays the chain to the on-chain
 * head; nothing here depends on a Reeg backend.
 */
export interface ProvenanceEntry {
  seq: bigint;
  eventType: number;
  blobId: bigint;
  manifestHash: Uint8Array;
  payloadHash: Uint8Array;
  timestampMs: bigint;
}

/**
 * Genesis head for a freshly created Machine: `blake2b256(machine_id_bytes)`. Matches
 * `machine::create`. A forked Machine instead starts from the child head emitted in its
 * MachineForked event.
 */
export function genesisHead(machineIdBytes: Uint8Array): Uint8Array {
  return blake2b256(machineIdBytes);
}

/**
 * Recompute a forked Machine's genesis (its child head) exactly as `machine::fork` does:
 * `blake2b256(parentHead ++ [EVENT_FORK] ++ childIdBytes)`. The verifier uses this to confirm
 * a child's emitted genesis is genuinely bound to the parent's head, rather than trusting it.
 */
export function computeForkChildHead(parentHead: Uint8Array, childIdBytes: Uint8Array): Uint8Array {
  return blake2b256(concatBytes([parentHead, Uint8Array.of(EVENT_FORK), childIdBytes]));
}

/**
 * Recompute the next provenance head exactly as the Move package does on chain. The preimage
 * order is the frozen contract (see move/sources/machine.move compute_entry_hash); the
 * numeric fields use BCS little-endian encoding, matching Move's `bcs::to_bytes`.
 */
export function computeEntryHash(prevHead: Uint8Array, entry: ProvenanceEntry): Uint8Array {
  // event_type is a Move u8: a wider number would silently truncate (Uint8Array.of masks
  // modulo 256), yielding a hash that no longer matches the chain, so reject it outright.
  if (!Number.isInteger(entry.eventType) || entry.eventType < 0 || entry.eventType > 255) {
    throw new RangeError(`eventType must be a u8 (0..255), got ${entry.eventType}`);
  }
  const preimage = concatBytes([
    prevHead,
    Uint8Array.of(entry.eventType),
    bcs.u64().serialize(entry.seq).toBytes(),
    bcs.u256().serialize(entry.blobId).toBytes(),
    entry.manifestHash,
    entry.payloadHash,
    bcs.u64().serialize(entry.timestampMs).toBytes(),
  ]);
  return blake2b256(preimage);
}

/**
 * A provenance entry plus the chain heads its event carries. Used only to order entries into
 * their true on-chain sequence: a grant or revoke shares a seq with the next checkpoint, so
 * ordering by seq is ambiguous, but the hash linkage prev_head -> new_head is not.
 */
export interface LinkedEntry {
  entry: ProvenanceEntry;
  prevHead: Uint8Array;
  newHead: Uint8Array;
}

/**
 * Order entries into their on-chain sequence by following the hash chain from `genesis`: the
 * first entry is the one whose prevHead equals the genesis, the next whose prevHead equals that
 * entry's newHead, and so on. This reproduces the exact chain order even when a grant or revoke
 * shares a seq with the next checkpoint. It is self-checking: an entry that does not link is
 * left out, so a tampered or missing link surfaces downstream as a head or count mismatch rather
 * than as a silent reorder. Each link is consumed once, so a forged cycle cannot loop forever.
 */
export function orderByLinkage(genesis: Uint8Array, items: LinkedEntry[]): ProvenanceEntry[] {
  const byPrev = new Map<string, LinkedEntry>();
  for (const item of items) {
    byPrev.set(toHex(item.prevHead), item);
  }
  const ordered: ProvenanceEntry[] = [];
  let head = toHex(genesis);
  let next = byPrev.get(head);
  while (next) {
    ordered.push(next.entry);
    byPrev.delete(head);
    head = toHex(next.newHead);
    next = byPrev.get(head);
  }
  return ordered;
}

/** Replay entries from `genesis`, returning the resulting head. */
export function replayChain(genesis: Uint8Array, entries: ProvenanceEntry[]): Uint8Array {
  let head = genesis;
  for (const entry of entries) {
    head = computeEntryHash(head, entry);
  }
  return head;
}

/**
 * Every head a chain passes through: the genesis, then the head after each entry. Used to
 * confirm a fork's recorded parent head was genuinely a head of the parent at some point,
 * not an attacker-invented value.
 */
export function collectHeads(genesis: Uint8Array, entries: ProvenanceEntry[]): Uint8Array[] {
  const heads = [genesis];
  let head = genesis;
  for (const entry of entries) {
    head = computeEntryHash(head, entry);
    heads.push(head);
  }
  return heads;
}
