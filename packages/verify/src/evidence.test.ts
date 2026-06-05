import type { Machine } from '@reeg/chain';
import { describe, expect, it } from 'vitest';
import {
  compareEvidence,
  type Evidence,
  fromEvidence,
  toEvidence,
  verifyEvidence,
} from './evidence';
import { fromHex, toHex } from './hash';
import { computeForkChildHead, genesisHead, type ProvenanceEntry, replayChain } from './provenance';
import type { VerifyInput } from './verifier';

const ID = `0x${'ab'.repeat(32)}`;
const ID_BYTES = fromHex(ID);
const META = {
  network: 'testnet',
  packageId: `0x${'9'.repeat(64)}`,
  exportedAtMs: 1_700_000_000_000,
};

function entry(seq: number, blobId: bigint): ProvenanceEntry {
  return {
    seq: BigInt(seq),
    eventType: 0,
    blobId,
    manifestHash: Uint8Array.of(seq, seq),
    payloadHash: Uint8Array.of(7, seq),
    timestampMs: BigInt(1000 + seq),
  };
}

function machineFor(
  entries: ProvenanceEntry[],
  genesis: Uint8Array,
  parent: string | null,
): Machine {
  const last = entries.at(-1);
  return {
    id: ID,
    owner: '0xowner',
    currentBlobId: last ? last.blobId : 0n,
    manifestHash: last ? last.manifestHash : new Uint8Array(),
    provenanceHead: replayChain(genesis, entries),
    checkpointCount: BigInt(entries.length),
    parent,
    policyId: '0xpolicy',
    createdAtEpoch: 1,
  };
}

// A round-trip through JSON proves the file is plain, portable JSON (what an auditor keeps).
function asFile(evidence: Evidence): Evidence {
  return JSON.parse(JSON.stringify(evidence)) as Evidence;
}

describe('evidence export and offline verification', () => {
  const entries = [entry(0, 100n), entry(1, 200n)];
  const genesis = genesisHead(ID_BYTES);
  const input: VerifyInput = {
    machine: machineFor(entries, genesis, null),
    machineIdBytes: ID_BYTES,
    entries,
  };

  it('verifies offline from the exported file, with no chain access', () => {
    const report = verifyEvidence(asFile(toEvidence(input, META)));
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });

  it('records the command-log digest and the entry-hash chain for the auditor', () => {
    const evidence = toEvidence(input, META);
    expect(evidence.machine.id).toBe(ID);
    expect(evidence.packageId).toBe(META.packageId);
    // The checkpoint payload hash is the command-log digest.
    expect(evidence.entries[0]?.payloadHash).toBe(toHex(Uint8Array.of(7, 0)));
    // The last entry hash is the on-chain provenance head.
    expect(evidence.entries.at(-1)?.entryHash).toBe(toHex(input.machine.provenanceHead));
  });

  it('fails when a provenance entry is tampered with', () => {
    const file = asFile(toEvidence(input, META));
    (file.entries[0] as Evidence['entries'][number]).blobId = '999';
    expect(verifyEvidence(file).ok).toBe(false);
  });

  it('fails when the recorded head is swapped', () => {
    const file = asFile(toEvidence(input, META));
    file.machine.provenanceHead = '00'.repeat(32);
    expect(verifyEvidence(file).ok).toBe(false);
  });

  it('rejects an unknown schema version rather than trusting it', () => {
    const file = { ...asFile(toEvidence(input, META)), schemaVersion: 999 };
    expect(() => fromEvidence(file)).toThrow(/schema version/);
  });

  it('compareEvidence detects machine, provenance, and lineage divergence (the anchor primitive)', () => {
    const base = toEvidence(input, META);
    expect(compareEvidence(base, asFile(base))).toEqual({
      machine: true,
      entries: true,
      fork: true,
    });

    const ownerChanged = asFile(base);
    ownerChanged.machine.owner = '0xattacker';
    expect(compareEvidence(base, ownerChanged).machine).toBe(false);

    const entryChanged = asFile(base);
    (entryChanged.entries[0] as Evidence['entries'][number]).payloadHash = 'ff';
    expect(compareEvidence(base, entryChanged).entries).toBe(false);

    // A forged parent attribution on an otherwise-identical file is caught as a lineage mismatch.
    const parentHead = Uint8Array.from(Array.from({ length: 32 }, () => 5));
    const childHead = computeForkChildHead(parentHead, ID_BYTES);
    const forked = toEvidence(
      {
        machine: machineFor([entry(0, 300n)], childHead, '0xrealparent'),
        machineIdBytes: ID_BYTES,
        entries: [entry(0, 300n)],
        fork: { childHead, parentHead, parentHeads: [parentHead] },
      },
      META,
    );
    const misattributed = asFile(forked);
    misattributed.fork = {
      ...(misattributed.fork as NonNullable<Evidence['fork']>),
      parentId: '0xwrongparent',
    };
    expect(compareEvidence(forked, misattributed).fork).toBe(false);
  });

  it('round-trips a forked Machine including its lineage', () => {
    const parentHead = Uint8Array.from(Array.from({ length: 32 }, () => 5));
    const childHead = computeForkChildHead(parentHead, ID_BYTES);
    const forkEntries = [entry(0, 300n)];
    const forkInput: VerifyInput = {
      machine: machineFor(forkEntries, childHead, '0xparent'),
      machineIdBytes: ID_BYTES,
      entries: forkEntries,
      fork: { childHead, parentHead, parentHeads: [Uint8Array.of(9), parentHead] },
    };
    const evidence = toEvidence(forkInput, META);
    expect(evidence.fork?.parentId).toBe('0xparent');
    expect(
      verifyEvidence(asFile(evidence)).ok,
      JSON.stringify(verifyEvidence(asFile(evidence)).checks),
    ).toBe(true);
  });
});
