import { describe, expect, it } from 'vitest';
import { parseMachineFields } from './machine';

describe('parseMachineFields', () => {
  it('parses a Machine with byte-array hashes and no parent', () => {
    const m = parseMachineFields('0xmachine', {
      owner: '0xowner',
      current_blob_id: '12345678901234567890',
      manifest_hash: [1, 2, 3],
      provenance_head: [4, 5, 6],
      checkpoint_count: '2',
      parent: null,
      policy_id: '0xpolicy',
      created_at_epoch: 42,
    });

    expect(m.owner).toBe('0xowner');
    expect(m.currentBlobId).toBe(12_345_678_901_234_567_890n);
    expect(Array.from(m.manifestHash)).toEqual([1, 2, 3]);
    expect(m.checkpointCount).toBe(2n);
    expect(m.parent).toBeNull();
    expect(m.policyId).toBe('0xpolicy');
    expect(m.createdAtEpoch).toBe(42);
  });

  it('collapses an Option<ID> parent in { vec } form to the id', () => {
    const m = parseMachineFields('0xchild', {
      owner: '0xo',
      current_blob_id: '0',
      manifest_hash: [],
      provenance_head: [],
      checkpoint_count: '0',
      parent: { vec: ['0xparent'] },
      policy_id: '0xp',
      created_at_epoch: 1,
    });
    expect(m.parent).toBe('0xparent');
  });

  it('accepts hex-string byte fields as an alternative encoding', () => {
    const m = parseMachineFields('0xm', {
      owner: '0xo',
      current_blob_id: '0',
      manifest_hash: '0x0a0b',
      provenance_head: '0x',
      checkpoint_count: '0',
      parent: null,
      policy_id: '0xp',
      created_at_epoch: 0,
    });
    expect(Array.from(m.manifestHash)).toEqual([10, 11]);
    expect(Array.from(m.provenanceHead)).toEqual([]);
  });

  it('rejects a missing required field rather than guessing', () => {
    expect(() => parseMachineFields('0xm', { owner: 123 as unknown as string })).toThrow(/owner/);
  });
});
