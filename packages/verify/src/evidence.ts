import type { Machine } from '@reeg/chain';
import { fromHex, toHex } from './hash';
import { collectHeads, genesisHead, type ProvenanceEntry } from './provenance';
import { type VerificationReport, type VerifyInput, verifyMachine } from './verifier';

// Bumped if the evidence layout changes. An auditor's verifier checks this before trusting a file.
export const EVIDENCE_SCHEMA_VERSION = 1;

/**
 * One provenance entry as it appears in an evidence file: the same fields the chain commits to,
 * serialized as strings/hex so the file is plain JSON. `payloadHash` on a checkpoint is the
 * command-log digest; `entryHash` is the resulting provenance head after this entry (recorded for
 * the auditor to read, but always recomputed during verification, never trusted).
 */
export interface EvidenceEntry {
  seq: string;
  eventType: number;
  blobId: string;
  manifestHash: string;
  payloadHash: string;
  timestampMs: string;
  entryHash: string;
}

/**
 * A portable, self-contained record of a Machine's history that an auditor can keep and verify
 * with no Reeg service and no Console (Article 12 record-keeping). It captures exactly what the
 * offline verifier needs: the Machine's on-chain facts, the full ordered provenance chain
 * (checkpoints plus grants/revokes), and any fork lineage. It adds no new trusted party: the
 * authority remains the on-chain `provenance_head`, which anyone can re-anchor against Sui using
 * the `machine.id` and `packageId` here.
 */
export interface Evidence {
  schemaVersion: number;
  network: string;
  packageId: string;
  /** When the export was taken, ms since epoch (metadata; not part of the integrity check). */
  exportedAtMs: string;
  machine: {
    id: string;
    owner: string;
    currentBlobId: string;
    manifestHash: string;
    provenanceHead: string;
    checkpointCount: string;
    parent: string | null;
    policyId: string;
    createdAtEpoch: number;
  };
  entries: EvidenceEntry[];
  fork: {
    parentId: string;
    parentHead: string;
    childHead: string;
    parentHeads: string[];
  } | null;
}

// The chain genesis for an input, matching the verifier: a fork starts at its bound child head, a
// freshly created Machine at blake2b256(id).
function chainGenesis(input: VerifyInput): Uint8Array {
  return input.fork ? input.fork.childHead : genesisHead(input.machineIdBytes);
}

/** Serialize a verification input into a portable evidence file. Pure: no chain access. */
export function toEvidence(
  input: VerifyInput,
  meta: { network: string; packageId: string; exportedAtMs: number },
): Evidence {
  const heads = collectHeads(chainGenesis(input), input.entries);
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    network: meta.network,
    packageId: meta.packageId,
    exportedAtMs: String(meta.exportedAtMs),
    machine: {
      id: input.machine.id,
      owner: input.machine.owner,
      currentBlobId: input.machine.currentBlobId.toString(),
      manifestHash: toHex(input.machine.manifestHash),
      provenanceHead: toHex(input.machine.provenanceHead),
      checkpointCount: input.machine.checkpointCount.toString(),
      parent: input.machine.parent,
      policyId: input.machine.policyId,
      createdAtEpoch: input.machine.createdAtEpoch,
    },
    entries: input.entries.map((entry, i) => ({
      seq: entry.seq.toString(),
      eventType: entry.eventType,
      blobId: entry.blobId.toString(),
      manifestHash: toHex(entry.manifestHash),
      payloadHash: toHex(entry.payloadHash),
      timestampMs: entry.timestampMs.toString(),
      entryHash: toHex(heads[i + 1] as Uint8Array),
    })),
    fork: input.fork
      ? {
          parentId: input.machine.parent ?? '',
          parentHead: toHex(input.fork.parentHead),
          childHead: toHex(input.fork.childHead),
          parentHeads: input.fork.parentHeads.map(toHex),
        }
      : null,
  };
}

/** Deserialize an evidence file back into a verification input. Pure: no chain access. Rejects an
 *  unknown schema version so an auditor never silently trusts a format they cannot check. */
export function fromEvidence(evidence: Evidence): VerifyInput {
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error(
      `unsupported evidence schema version ${evidence.schemaVersion} (expected ${EVIDENCE_SCHEMA_VERSION})`,
    );
  }
  const m = evidence.machine;
  const machine: Machine = {
    id: m.id,
    owner: m.owner,
    currentBlobId: BigInt(m.currentBlobId),
    manifestHash: fromHex(m.manifestHash),
    provenanceHead: fromHex(m.provenanceHead),
    checkpointCount: BigInt(m.checkpointCount),
    parent: m.parent,
    policyId: m.policyId,
    createdAtEpoch: m.createdAtEpoch,
  };
  const entries: ProvenanceEntry[] = evidence.entries.map((e) => ({
    seq: BigInt(e.seq),
    eventType: e.eventType,
    blobId: BigInt(e.blobId),
    manifestHash: fromHex(e.manifestHash),
    payloadHash: fromHex(e.payloadHash),
    timestampMs: BigInt(e.timestampMs),
  }));
  const fork = evidence.fork
    ? {
        childHead: fromHex(evidence.fork.childHead),
        parentHead: fromHex(evidence.fork.parentHead),
        parentHeads: evidence.fork.parentHeads.map(fromHex),
      }
    : undefined;
  return { machine, machineIdBytes: fromHex(m.id), entries, fork };
}

/**
 * Verify a run from an evidence file alone, offline: replay the provenance chain to the recorded
 * head and confirm the checkpoint anchors, with no Reeg, no Console, and no chain access. A
 * tampered file fails because the replay no longer reaches the recorded head. This proves the
 * record is internally consistent and untampered; to also confirm the recorded head is the real
 * on-chain state, re-anchor against Sui (see anchorEvidence) using the machine id in the file.
 */
export function verifyEvidence(evidence: Evidence): VerificationReport {
  return verifyMachine(fromEvidence(evidence));
}

/** Whether two evidence records agree on each integrity-relevant section. Used to anchor a file
 *  against a freshly re-derived on-chain record: every machine fact, every provenance entry, and
 *  the full fork lineage must match, not just the head. Metadata (exportedAtMs) is ignored. */
export interface EvidenceComparison {
  machine: boolean;
  entries: boolean;
  fork: boolean;
}

export function compareEvidence(a: Evidence, b: Evidence): EvidenceComparison {
  return {
    machine: machineEqual(a.machine, b.machine),
    entries: entriesEqual(a.entries, b.entries),
    fork: forkEqual(a.fork, b.fork),
  };
}

function machineEqual(a: Evidence['machine'], b: Evidence['machine']): boolean {
  return (
    a.id === b.id &&
    a.owner === b.owner &&
    a.currentBlobId === b.currentBlobId &&
    a.manifestHash === b.manifestHash &&
    a.provenanceHead === b.provenanceHead &&
    a.checkpointCount === b.checkpointCount &&
    a.parent === b.parent &&
    a.policyId === b.policyId &&
    a.createdAtEpoch === b.createdAtEpoch
  );
}

function entriesEqual(a: EvidenceEntry[], b: EvidenceEntry[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((e, i) => {
    const o = b[i] as EvidenceEntry;
    return (
      e.seq === o.seq &&
      e.eventType === o.eventType &&
      e.blobId === o.blobId &&
      e.manifestHash === o.manifestHash &&
      e.payloadHash === o.payloadHash &&
      e.timestampMs === o.timestampMs &&
      e.entryHash === o.entryHash
    );
  });
}

function forkEqual(a: Evidence['fork'], b: Evidence['fork']): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.parentId === b.parentId &&
    a.parentHead === b.parentHead &&
    a.childHead === b.childHead &&
    a.parentHeads.length === b.parentHeads.length &&
    a.parentHeads.every((h, i) => h === b.parentHeads[i])
  );
}
