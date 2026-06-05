import { RIGHTS_RESTORE, RIGHTS_VIEW } from '@reeg/sdk';
import { describe, expect, it } from 'vitest';
import { parseExpiry, role, roleToRights } from './grant-options';

describe('role / roleToRights', () => {
  it('defaults to restore (view + restore bits)', () => {
    expect(role(undefined)).toBe('restore');
    expect(roleToRights(undefined)).toBe(RIGHTS_VIEW | RIGHTS_RESTORE);
    expect(roleToRights('restore')).toBe(RIGHTS_VIEW | RIGHTS_RESTORE);
  });

  it('viewer is view only', () => {
    expect(role('viewer')).toBe('viewer');
    expect(roleToRights('viewer')).toBe(RIGHTS_VIEW);
  });
});

describe('parseExpiry', () => {
  const NOW = 1_700_000_000_000;

  it('returns 0 for no expiry', () => {
    expect(parseExpiry(undefined, NOW)).toBe(0n);
  });

  it('parses durations relative to now', () => {
    expect(parseExpiry('30s', NOW)).toBe(BigInt(NOW + 30_000));
    expect(parseExpiry('30m', NOW)).toBe(BigInt(NOW + 30 * 60_000));
    expect(parseExpiry('24h', NOW)).toBe(BigInt(NOW + 24 * 3_600_000));
    expect(parseExpiry('7d', NOW)).toBe(BigInt(NOW + 7 * 86_400_000));
  });

  it('parses an ISO 8601 instant', () => {
    expect(parseExpiry('2026-07-01T00:00:00.000Z', NOW)).toBe(
      BigInt(Date.parse('2026-07-01T00:00:00.000Z')),
    );
  });

  it('rejects nonsense', () => {
    expect(() => parseExpiry('soon', NOW)).toThrow(/ISO 8601/);
  });
});
