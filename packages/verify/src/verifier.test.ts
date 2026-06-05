import type { Machine } from '@reeg/chain';
import { describe, expect, it } from 'vitest';
import { computeForkChildHead, genesisHead, type ProvenanceEntry, replayChain } from './provenance';
import { type ForkProof, verifyMachine } from './verifier';

const ID_BYTES = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));

function entry(seq: number, blobId: bigint): ProvenanceEntry {
  return {
    seq: BigInt(seq),
    eventType: 0,
    blobId,
    manifestHash: Uint8Array.of(seq, seq, seq),
    payloadHash: Uint8Array.of(9),
    timestampMs: BigInt(1000 + seq),
  };
}

// Build a Machine whose on-chain fields match a chain replayed from `genesis` over `entries`.
function machineFor(
  entries: ProvenanceEntry[],
  genesis: Uint8Array,
  parent: string | null,
): Machine {
  const last = entries.at(-1);
  return {
    id: '0xmachine',
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

function failed(report: { checks: { name: string; passed: boolean }[] }): string[] {
  return report.checks.filter((c) => !c.passed).map((c) => c.name);
}

describe('verifyMachine - linear chains', () => {
  const entries = [entry(0, 100n), entry(1, 200n)];
  const genesis = genesisHead(ID_BYTES);

  it('passes for a well-formed run', () => {
    const report = verifyMachine({
      machine: machineFor(entries, genesis, null),
      machineIdBytes: ID_BYTES,
      entries,
    });
    expect(report.ok).toBe(true);
  });

  it('fails when a provenance entry is tampered with', () => {
    const machine = machineFor(entries, genesis, null);
    const tampered = entries.map((e) => ({ ...e }));
    (tampered[0] as ProvenanceEntry).manifestHash = Uint8Array.of(255, 255, 255);
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries: tampered });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('provenance-head');
  });

  it('fails when entries are reordered', () => {
    const machine = machineFor(entries, genesis, null);
    const reordered = [entries[1] as ProvenanceEntry, entries[0] as ProvenanceEntry];
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries: reordered });
    expect(report.ok).toBe(false);
    expect(failed(report)).toEqual(
      expect.arrayContaining(['provenance-head', 'sequence-contiguous']),
    );
  });

  it('fails on a duplicate seq even if the head still matches the chain', () => {
    const dup = [entry(0, 1n), entry(0, 2n), entry(1, 3n)];
    const machine = machineFor(dup, genesis, null); // head matches the duplicate chain
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries: dup });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('sequence-contiguous');
  });

  it('fails on a gap in seq even if the head still matches the chain', () => {
    const gapped = [entry(0, 1n), entry(2, 2n)];
    const machine = machineFor(gapped, genesis, null);
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries: gapped });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('sequence-contiguous');
  });

  it('fails when the on-chain head does not match the chain', () => {
    const machine: Machine = {
      ...machineFor(entries, genesis, null),
      provenanceHead: Uint8Array.of(0, 0, 0),
    };
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('provenance-head');
  });

  it('fails when the pinned blob id does not match the latest checkpoint', () => {
    const machine: Machine = { ...machineFor(entries, genesis, null), currentBlobId: 999n };
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('current-blob-id');
  });

  it('fails when the checkpoint count is inflated', () => {
    const machine: Machine = { ...machineFor(entries, genesis, null), checkpointCount: 5n };
    const report = verifyMachine({ machine, machineIdBytes: ID_BYTES, entries });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('checkpoint-count');
  });
});

describe('verifyMachine - fork lineage', () => {
  const PARENT_HEAD = Uint8Array.from(Array.from({ length: 32 }, () => 5));
  const CHILD_HEAD = computeForkChildHead(PARENT_HEAD, ID_BYTES);
  const entries = [entry(0, 300n)];

  function forkScenario(fork: ForkProof) {
    const machine = machineFor(entries, fork.childHead, '0xparent');
    return verifyMachine({ machine, machineIdBytes: ID_BYTES, entries, fork });
  }

  it('passes when the child genesis is bound to a real parent head', () => {
    const report = forkScenario({
      childHead: CHILD_HEAD,
      parentHead: PARENT_HEAD,
      parentHeads: [Uint8Array.from(Array.from({ length: 32 }, () => 1)), PARENT_HEAD],
    });
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });

  it('fails when the child genesis is forged (not bound to the parent head)', () => {
    const forged = Uint8Array.from(Array.from({ length: 32 }, () => 7));
    const report = forkScenario({
      childHead: forged,
      parentHead: PARENT_HEAD,
      parentHeads: [PARENT_HEAD],
    });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('fork-binding');
  });

  it('fails when the recorded parent head is not a real head of the parent chain', () => {
    const report = forkScenario({
      childHead: CHILD_HEAD,
      parentHead: PARENT_HEAD,
      parentHeads: [Uint8Array.from(Array.from({ length: 32 }, () => 1))], // PARENT_HEAD absent
    });
    expect(report.ok).toBe(false);
    expect(failed(report)).toContain('fork-parent-head');
  });
});
