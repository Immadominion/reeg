import { RIGHTS_RESTORE, RIGHTS_VIEW } from '@reeg/sdk';

/** Normalize the --role flag. restore implies view; a viewer gets view only. */
export function role(roleName?: string): 'viewer' | 'restore' {
  return roleName === 'viewer' ? 'viewer' : 'restore';
}

/** The rights bitfield for a role. Both roles release the key on chain; the distinction is a
 *  client-side label (a viewer is not offered the restore flow). */
export function roleToRights(roleName?: string): number {
  return role(roleName) === 'viewer' ? RIGHTS_VIEW : RIGHTS_VIEW | RIGHTS_RESTORE;
}

/**
 * Parse the --until flag into an expiry in ms since epoch: an ISO 8601 instant, or a short
 * duration from now (7d, 24h, 30m, 45s). Returns 0n for no expiry (the flag absent).
 */
export function parseExpiry(value: string | undefined, now: number): bigint {
  if (!value) {
    return 0n;
  }
  const duration = value.match(/^(\d+)([smhd])$/);
  if (duration) {
    const amount = Number(duration[1]);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[duration[2] as string] ?? 0;
    return BigInt(now + amount * unitMs);
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    throw new Error('--until must be an ISO 8601 time or a duration like 7d, 24h, 30m');
  }
  return BigInt(at);
}
