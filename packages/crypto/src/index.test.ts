import { describe, expect, it } from 'vitest';
import { toIdentity, toPolicyIdentity } from './index';

const POLICY = `0x${'a'.repeat(64)}`;
const MACHINE = `0x${'b'.repeat(64)}`;

describe('Seal identities', () => {
  it('toIdentity is the Machine id without 0x', () => {
    expect(toIdentity(MACHINE)).toBe('b'.repeat(64));
    expect(toIdentity('b'.repeat(64))).toBe('b'.repeat(64));
  });

  it('toPolicyIdentity is policy id bytes followed by machine id bytes, hex without 0x', () => {
    const id = toPolicyIdentity(POLICY, MACHINE);
    expect(id).toBe('a'.repeat(64) + 'b'.repeat(64));
    expect(id).toHaveLength(128); // two 32-byte ids
    // Must match what reeg::access::expected_identity builds and @reeg/chain passes to seal_approve.
    expect(id.startsWith(toIdentity(POLICY))).toBe(true);
    expect(id.endsWith(toIdentity(MACHINE))).toBe(true);
  });

  // The on-chain expected_identity is always the canonical 32-byte object id (zero-padded). A
  // short or odd-length id must normalize to the same bytes, or decryption would silently fail.
  it('normalizes short ids to the canonical 32-byte form', () => {
    expect(toIdentity('0x1')).toBe(`${'0'.repeat(63)}1`);
    expect(toIdentity('0x1')).toHaveLength(64);
    const id = toPolicyIdentity('0x1', '0x2');
    expect(id).toBe(`${'0'.repeat(63)}1${'0'.repeat(63)}2`);
    expect(id).toHaveLength(128);
  });

  it('is invariant to a leading 0x and to leading-zero shortening', () => {
    expect(toPolicyIdentity(POLICY, MACHINE)).toBe(
      toPolicyIdentity(POLICY.slice(2), MACHINE.slice(2)),
    );
  });
});
