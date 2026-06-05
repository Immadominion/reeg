import { describe, expect, it } from 'vitest';
import {
  eventTitle,
  expiryLabel,
  friendlyName,
  relativeTime,
  roleLabel,
  sameAddress,
  shortId,
  snapshotLabel,
} from './format';

describe('friendlyName', () => {
  it('is deterministic and reads as adjective-noun', () => {
    const id = `0x${'ab'.repeat(32)}`;
    expect(friendlyName(id)).toBe(friendlyName(id));
    expect(friendlyName(id)).toMatch(/^[a-z]+-[a-z]+$/);
  });
});

describe('shortId', () => {
  it('abbreviates a long id and preserves a short one', () => {
    expect(shortId(`0x${'1234567890abcdef'.repeat(4)}`)).toBe('0x1234…cdef');
    expect(shortId('0xabcd')).toBe('0xabcd');
  });
});

describe('snapshotLabel', () => {
  it('counts from one for humans', () => {
    expect(snapshotLabel(0n)).toBe('Snapshot #1');
    expect(snapshotLabel(13n)).toBe('Snapshot #14');
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000_000;
  it('reads as just now under a minute', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
  });
  it('uses minutes, hours, and days with correct plurals', () => {
    expect(relativeTime(now - 60_000, now)).toBe('1 min ago');
    expect(relativeTime(now - 3 * 60_000, now)).toBe('3 mins ago');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 hrs ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 days ago');
  });
});

describe('eventTitle', () => {
  it('uses plain language with no chain terms', () => {
    expect(eventTitle('created')).toBe('Environment created');
    expect(eventTitle('checkpoint')).toBe('Snapshot saved');
    expect(eventTitle('fork')).toBe('Forked from another environment');
    expect(eventTitle('grant')).toBe('Shared with someone');
    expect(eventTitle('revoke')).toBe('Access removed');
  });
});

describe('roleLabel', () => {
  it('reads restore from the restore bit, otherwise viewer', () => {
    expect(roleLabel(1)).toBe('Viewer'); // view only
    expect(roleLabel(2)).toBe('Can restore'); // restore bit set
    expect(roleLabel(3)).toBe('Can restore'); // view + restore
  });
});

describe('expiryLabel', () => {
  const now = 1_700_000_000_000;
  it('says no expiry for 0', () => {
    expect(expiryLabel(0n, now)).toBe('No expiry');
  });
  it('says expired in the past and relative in the future', () => {
    expect(expiryLabel(BigInt(now - 1000), now)).toBe('Expired');
    expect(expiryLabel(BigInt(now + 2 * 86_400_000), now)).toBe('Expires in 2 days');
    expect(expiryLabel(BigInt(now + 5 * 3_600_000), now)).toBe('Expires in 5 hrs');
  });
});

describe('sameAddress', () => {
  it('compares canonically across 0x and leading-zero forms', () => {
    expect(sameAddress('0x00ab', 'ab')).toBe(true);
    expect(sameAddress('0xAB', '0xab')).toBe(true);
    expect(sameAddress('0x1', '0x2')).toBe(false);
  });
});
