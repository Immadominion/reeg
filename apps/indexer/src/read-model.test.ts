import { describe, expect, it } from 'vitest';
import { buildModel, listEnvironments, type ReegEvent } from './read-model';

const M = '0xmachine';
const C = '0xchild';

describe('read model', () => {
  it('folds created and checkpoints into a sorted record', () => {
    const events: ReegEvent[] = [
      { type: 'created', machineId: M, owner: '0xowner', createdAtEpoch: 5 },
      { type: 'checkpoint', machineId: M, seq: 1n, blobId: 200n, timestampMs: 2000n },
      { type: 'checkpoint', machineId: M, seq: 0n, blobId: 100n, timestampMs: 1000n },
    ];
    const record = buildModel(events).get(M);
    expect(record?.owner).toBe('0xowner');
    expect(record?.createdAtEpoch).toBe(5);
    expect(record?.checkpoints.map((c) => c.seq)).toEqual([0n, 1n]);
  });

  it('records fork lineage on the child', () => {
    const record = buildModel([{ type: 'forked', childId: C, parentId: M }]).get(C);
    expect(record?.parentId).toBe(M);
  });

  it('tolerates a checkpoint seen before its create (out of order)', () => {
    const events: ReegEvent[] = [
      { type: 'checkpoint', machineId: M, seq: 0n, blobId: 1n, timestampMs: 1n },
      { type: 'created', machineId: M, owner: '0xo', createdAtEpoch: 1 },
    ];
    const record = buildModel(events).get(M);
    expect(record?.owner).toBe('0xo');
    expect(record?.checkpoints).toHaveLength(1);
  });

  it('is idempotent: re-applying a checkpoint does not duplicate it', () => {
    const events: ReegEvent[] = [
      { type: 'checkpoint', machineId: M, seq: 0n, blobId: 1n, timestampMs: 1n },
      { type: 'checkpoint', machineId: M, seq: 0n, blobId: 1n, timestampMs: 1n },
    ];
    expect(buildModel(events).get(M)?.checkpoints).toHaveLength(1);
  });

  it('lists environments oldest-first by created epoch', () => {
    const events: ReegEvent[] = [
      { type: 'created', machineId: '0xb', owner: '0xo', createdAtEpoch: 9 },
      { type: 'created', machineId: '0xa', owner: '0xo', createdAtEpoch: 2 },
    ];
    expect(listEnvironments(buildModel(events)).map((e) => e.id)).toEqual(['0xa', '0xb']);
  });
});
