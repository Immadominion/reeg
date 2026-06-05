import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { readMachine } from '@reeg/chain';
import { compareEvidence, type Evidence, toEvidence } from './evidence';
import { fromHex } from './hash';
import {
  collectHeads,
  EVENT_CHECKPOINT,
  EVENT_GRANT,
  EVENT_RETIRE,
  EVENT_REVOKE,
  genesisHead,
  type LinkedEntry,
  orderByLinkage,
  type ProvenanceEntry,
} from './provenance';
import { type Check, type VerificationReport, type VerifyInput, verifyMachine } from './verifier';

// Shapes of the Machine package events we read. Field names match the Move event structs.
interface CheckpointRegisteredJson {
  machine_id: string;
  seq: string;
  blob_id: string;
  manifest_hash: number[] | string;
  payload_hash: number[] | string;
  prev_head: number[] | string;
  new_head: number[] | string;
  timestamp_ms: string;
}

interface MachineForkedJson {
  child_id: string;
  parent_id: string;
  parent_head: number[] | string;
  child_head: number[] | string;
}

// AccessGranted and AccessRevoked from reeg::access. Both carry the full provenance preimage
// fields (so the entry rehashes offline) plus the grantee; AccessGranted also carries rights and
// expiry for the access timeline.
interface AccessEventJson {
  machine_id: string;
  policy_id: string;
  grantee: string;
  rights?: string;
  expiry_ms?: string;
  seq: string;
  blob_id: string;
  manifest_hash: number[] | string;
  payload_hash: number[] | string;
  prev_head: number[] | string;
  new_head: number[] | string;
  timestamp_ms: string;
}

/** The fork lineage a child Machine records, read from its MachineForked event. */
export interface ForkEvent {
  parentId: string;
  parentHead: Uint8Array;
  childHead: Uint8Array;
}

export type AccessKind = 'grant' | 'revoke';

/** One entry in a Machine's sharing history, reconstructed from access events alone. */
export interface AccessRecord {
  kind: AccessKind;
  grantee: string;
  /** Rights bitfield on a grant (bit 0 view, bit 1 restore); absent on a revoke. */
  rights?: number;
  /** Grant expiry in ms (0 means no expiry); absent on a revoke. */
  expiryMs?: bigint;
  seq: bigint;
  timestampMs: bigint;
}

export interface VerifyFromChainOptions {
  /**
   * Optional storage-availability check: confirm the checkpoint ciphertext is retrievable at
   * the blob id the Machine pins. The reader fetches by the u256 blob id (for example
   * WalrusBlobStore.readByU256). The provenance verification does not require it; supplying it
   * adds a `blob-available` check that the pinned blob can actually be fetched.
   */
  blobReader?: (blobIdU256: bigint) => Promise<Uint8Array>;
}

/** The object id as raw bytes, the genesis preimage for a non-forked Machine. */
export function machineIdBytes(machineId: string): Uint8Array {
  return fromHex(machineId);
}

// Page through one Move event type, keeping only events for this Machine. Reads public event
// data only; no Reeg backend is involved.
async function queryMachineEvents(
  client: SuiJsonRpcClient,
  eventType: string,
  machineId: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined;
  do {
    const page = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      order: 'ascending',
    });
    for (const event of page.data) {
      const json = event.parsedJson as { machine_id?: string };
      if (json.machine_id === machineId) {
        out.push(json as Record<string, unknown>);
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return out;
}

function checkpointLink(json: CheckpointRegisteredJson): LinkedEntry {
  return {
    entry: {
      seq: BigInt(json.seq),
      eventType: EVENT_CHECKPOINT,
      blobId: BigInt(json.blob_id),
      manifestHash: parseBytes(json.manifest_hash),
      payloadHash: parseBytes(json.payload_hash),
      timestampMs: BigInt(json.timestamp_ms),
    },
    prevHead: parseBytes(json.prev_head),
    newHead: parseBytes(json.new_head),
  };
}

function accessLink(json: AccessEventJson, eventType: number): LinkedEntry {
  return {
    entry: {
      seq: BigInt(json.seq),
      eventType,
      blobId: BigInt(json.blob_id),
      manifestHash: parseBytes(json.manifest_hash),
      payloadHash: parseBytes(json.payload_hash),
      timestampMs: BigInt(json.timestamp_ms),
    },
    prevHead: parseBytes(json.prev_head),
    newHead: parseBytes(json.new_head),
  };
}

/** The Machine's checkpoint provenance entries with their chain links, for ordering. */
export async function fetchCheckpointLinks(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<LinkedEntry[]> {
  const events = await queryMachineEvents(
    client,
    `${packageId}::machine::CheckpointRegistered`,
    machineId,
  );
  return events.map((e) => checkpointLink(e as unknown as CheckpointRegisteredJson));
}

/** The Machine's grant and revoke provenance entries with their chain links, for ordering. */
export async function fetchAccessLinks(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<LinkedEntry[]> {
  const granted = await queryMachineEvents(
    client,
    `${packageId}::access::AccessGranted`,
    machineId,
  );
  const revoked = await queryMachineEvents(
    client,
    `${packageId}::access::AccessRevoked`,
    machineId,
  );
  return [
    ...granted.map((e) => accessLink(e as unknown as AccessEventJson, EVENT_GRANT)),
    ...revoked.map((e) => accessLink(e as unknown as AccessEventJson, EVENT_REVOKE)),
  ];
}

/** The Machine's retire (end-of-life) provenance entries with their chain links, for ordering. */
export async function fetchRetireLinks(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<LinkedEntry[]> {
  const retired = await queryMachineEvents(
    client,
    `${packageId}::machine::MachineRetired`,
    machineId,
  );
  return retired.map((e) => accessLink(e as unknown as AccessEventJson, EVENT_RETIRE));
}

/** Whether a Machine has been retired, read from its MachineRetired events. The Reeg client uses
 *  this to decline further checkpoints on a concluded run. Performs a network read (public data
 *  only) and may throw on a transient RPC/indexer error, so callers that gate an action on it
 *  should decide deliberately whether to fail open or closed. */
export async function isRetired(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<boolean> {
  return (await fetchRetireLinks(client, packageId, machineId)).length > 0;
}

/**
 * Reconstruct a Machine's checkpoint provenance entries from chain events, ascending by seq.
 * Reads only public event data; no Reeg backend is involved. This is the checkpoint timeline the
 * Console renders; verification uses the linkage-ordered full chain (see verifyFromChain).
 */
export async function fetchProvenanceEntries(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<ProvenanceEntry[]> {
  const links = await fetchCheckpointLinks(client, packageId, machineId);
  return links.map((l) => l.entry).sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
}

/**
 * Reconstruct a Machine's sharing history (grants and revokes) from access events alone, in
 * emission order. Used by the Console's access timeline; needs no live object read, so it works
 * with the Reeg backend offline (NFR-1).
 */
export async function reconstructAccessTimeline(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<AccessRecord[]> {
  const granted = await queryMachineEvents(
    client,
    `${packageId}::access::AccessGranted`,
    machineId,
  );
  const revoked = await queryMachineEvents(
    client,
    `${packageId}::access::AccessRevoked`,
    machineId,
  );
  const all: AccessRecord[] = [
    ...granted.map((event) => {
      const json = event as unknown as AccessEventJson;
      return {
        kind: 'grant' as const,
        grantee: json.grantee,
        rights: json.rights !== undefined ? Number(json.rights) : undefined,
        expiryMs: json.expiry_ms !== undefined ? BigInt(json.expiry_ms) : undefined,
        seq: BigInt(json.seq),
        timestampMs: BigInt(json.timestamp_ms),
      };
    }),
    ...revoked.map((event) => {
      const json = event as unknown as AccessEventJson;
      return {
        kind: 'revoke' as const,
        grantee: json.grantee,
        seq: BigInt(json.seq),
        timestampMs: BigInt(json.timestamp_ms),
      };
    }),
  ];
  return all.sort((a, b) =>
    a.timestampMs < b.timestampMs
      ? -1
      : a.timestampMs > b.timestampMs
        ? 1
        : a.seq < b.seq
          ? -1
          : a.seq > b.seq
            ? 1
            : 0,
  );
}

/** The fork lineage recorded for `machineId`, or null if it was created fresh. */
export async function fetchForkEvent(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<ForkEvent | null> {
  const eventType = `${packageId}::machine::MachineForked`;
  let cursor: { txDigest: string; eventSeq: string } | null | undefined;
  do {
    const page = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      order: 'ascending',
    });
    for (const event of page.data) {
      const json = event.parsedJson as MachineForkedJson;
      if (json.child_id === machineId) {
        return {
          parentId: json.parent_id,
          parentHead: parseBytes(json.parent_head),
          childHead: parseBytes(json.child_head),
        };
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return null;
}

/**
 * Thrown when a forked Machine has no MachineForked event, so its lineage cannot be reconstructed.
 * verifyFromChain turns this into a failed `fork-event` check; evidence export lets it propagate,
 * since no valid evidence can be produced for it.
 */
export class ForkEventMissingError extends Error {
  constructor(machineId: string, parent: string, packageId: string) {
    super(
      `Machine ${machineId} has parent ${parent} but no MachineForked event was found for package ${packageId}`,
    );
    this.name = 'ForkEventMissingError';
  }
}

/**
 * Read a Machine and reconstruct everything the offline verifier needs: its on-chain facts, the
 * full provenance chain (checkpoints and any grant/revoke entries) ordered by hash linkage, and
 * any fork lineage verified against the parent's real chain. Shared by verifyFromChain and
 * exportEvidence so the live check and the exported record never disagree.
 */
export async function gatherVerifyInput(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<VerifyInput> {
  const machine = await readMachine(client, machineId);
  const idBytes = machineIdBytes(machineId);

  let genesis: Uint8Array;
  let fork:
    | { childHead: Uint8Array; parentHead: Uint8Array; parentHeads: Uint8Array[] }
    | undefined;
  if (machine.parent) {
    const forkEvent = await fetchForkEvent(client, packageId, machineId);
    if (!forkEvent) {
      throw new ForkEventMissingError(machineId, machine.parent, packageId);
    }
    genesis = forkEvent.childHead;
    fork = {
      childHead: forkEvent.childHead,
      parentHead: forkEvent.parentHead,
      parentHeads: await parentChainHeads(client, packageId, forkEvent.parentId),
    };
  } else {
    genesis = genesisHead(idBytes);
  }

  const links = [
    ...(await fetchCheckpointLinks(client, packageId, machineId)),
    ...(await fetchAccessLinks(client, packageId, machineId)),
    ...(await fetchRetireLinks(client, packageId, machineId)),
  ];
  return { machine, machineIdBytes: idBytes, entries: orderByLinkage(genesis, links), fork };
}

/**
 * End-to-end verification from a Sui RPC alone: reconstruct the Machine's full provenance, verify
 * any fork lineage against the parent's real chain, and confirm the chain replays to the on-chain
 * head. This is what the Console's Verify button and the `reeg verify` command call; it works
 * with the Reeg backend offline.
 */
export async function verifyFromChain(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
  options: VerifyFromChainOptions = {},
): Promise<VerificationReport> {
  let input: VerifyInput;
  try {
    input = await gatherVerifyInput(client, packageId, machineId);
  } catch (err) {
    if (err instanceof ForkEventMissingError) {
      return { ok: false, checks: [{ name: 'fork-event', passed: false, detail: err.message }] };
    }
    throw err;
  }

  const report = verifyMachine(input);

  if (options.blobReader && input.machine.currentBlobId !== 0n) {
    const available = await blobIsAvailable(options.blobReader, input.machine.currentBlobId);
    report.checks.push({
      name: 'blob-available',
      passed: available,
      detail: `checkpoint blob ${input.machine.currentBlobId} ${available ? 'is retrievable' : 'could not be fetched'}`,
    });
    report.ok = report.ok && available;
  }

  return report;
}

/**
 * Export a portable evidence file for a Machine, read from chain. Pairs with verifyEvidence, which
 * an auditor runs offline (no Reeg, no Console), and anchorEvidence, which re-confirms the file
 * against live Sui.
 */
export async function exportEvidence(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
  meta: { network: string; exportedAtMs: number },
): Promise<Evidence> {
  const input = await gatherVerifyInput(client, packageId, machineId);
  return toEvidence(input, { network: meta.network, packageId, exportedAtMs: meta.exportedAtMs });
}

/**
 * Re-anchor an evidence file against live Sui: re-derive the authoritative record straight from
 * chain (gatherVerifyInput, which re-reads the fork event and recomputes the parent's real chain
 * of heads, so lineage is verified rather than trusted from the file) and confirm the file matches
 * it field for field. This binds the whole record, not just the head: every machine fact, every
 * provenance entry, and the full fork lineage. Offline verifyEvidence proves the file is internally
 * consistent; anchoring proves it is the real chain. Pass `--package` if you do not trust the
 * package id recorded in the file; otherwise the file's package is used to read its events, and a
 * wrong package surfaces as a provenance mismatch (the entries will not match).
 */
export async function anchorEvidence(
  client: SuiJsonRpcClient,
  evidence: Evidence,
  options: VerifyFromChainOptions & { packageId?: string } = {},
): Promise<Check[]> {
  const packageId = options.packageId ?? evidence.packageId;

  let input: VerifyInput;
  try {
    input = await gatherVerifyInput(client, packageId, evidence.machine.id);
  } catch (err) {
    if (err instanceof ForkEventMissingError) {
      return [
        {
          name: 'anchor-lineage',
          passed: false,
          detail: `evidence records a fork but no MachineForked event exists on chain: ${err.message}`,
        },
      ];
    }
    throw err;
  }

  const onChain = toEvidence(input, { network: evidence.network, packageId, exportedAtMs: 0 });
  const match = compareEvidence(onChain, evidence);
  const checks: Check[] = [
    {
      name: 'anchor-machine',
      passed: match.machine,
      detail: match.machine
        ? 'every Machine fact (owner, head, blob, manifest, count, parent, policy) matches the chain'
        : 'a Machine fact does not match the on-chain Machine',
    },
    {
      name: 'anchor-provenance',
      passed: match.entries,
      detail: `${evidence.entries.length} evidence entries vs ${onChain.entries.length} on chain${match.entries ? ' (identical)' : ' (differ)'}`,
    },
    {
      name: 'anchor-lineage',
      passed: match.fork,
      detail: match.fork
        ? evidence.fork
          ? 'fork parent and head chain match the on-chain lineage'
          : 'no fork claimed, none on chain'
        : 'fork lineage does not match the on-chain MachineForked event and parent chain',
    },
  ];

  if (options.blobReader && input.machine.currentBlobId !== 0n) {
    const available = await blobIsAvailable(options.blobReader, input.machine.currentBlobId);
    checks.push({
      name: 'blob-available',
      passed: available,
      detail: `checkpoint blob ${input.machine.currentBlobId} ${available ? 'is retrievable' : 'could not be fetched'}`,
    });
  }
  return checks;
}

// Every head the parent's chain passes through, so a fork's recorded parent head can be
// confirmed to be a genuine head. Includes the parent's grant/revoke entries, since a fork can
// be taken right after a sharing change, making an access head the recorded parent head. The
// parent's own genesis is id-derived, or, if the parent is itself a fork, the child head from
// its fork event (one level; the parent verifies independently via its own verifyFromChain).
async function parentChainHeads(
  client: SuiJsonRpcClient,
  packageId: string,
  parentId: string,
): Promise<Uint8Array[]> {
  const parent = await readMachine(client, parentId);
  let parentGenesis: Uint8Array;
  if (parent.parent) {
    const parentFork = await fetchForkEvent(client, packageId, parentId);
    parentGenesis = parentFork ? parentFork.childHead : genesisHead(machineIdBytes(parentId));
  } else {
    parentGenesis = genesisHead(machineIdBytes(parentId));
  }
  const links = [
    ...(await fetchCheckpointLinks(client, packageId, parentId)),
    ...(await fetchAccessLinks(client, packageId, parentId)),
    ...(await fetchRetireLinks(client, packageId, parentId)),
  ];
  const entries = orderByLinkage(parentGenesis, links);
  return collectHeads(parentGenesis, entries);
}

async function blobIsAvailable(
  reader: (blobIdU256: bigint) => Promise<Uint8Array>,
  blobIdU256: bigint,
): Promise<boolean> {
  try {
    const bytes = await reader(blobIdU256);
    return bytes.length > 0;
  } catch {
    return false;
  }
}

// Event vector<u8> is returned as a byte array, or as hex on some nodes; accept both.
function parseBytes(value: number[] | string): Uint8Array {
  return typeof value === 'string' ? fromHex(value) : Uint8Array.from(value);
}
