// Plain-English formatting for the UI. The hard rule (design brief) is hide the blockchain:
// these helpers turn ids, hashes, and on-chain facts into calm, human labels. All pure, so
// they are unit-tested directly.

// Deterministic friendly name lists (Docker-style), so an environment reads as a name rather
// than a hex id. Lengths are powers of two so the modulo is even.
const ADJECTIVES = ['calm', 'brisk', 'amber', 'quiet', 'swift', 'noble', 'keen', 'vivid'];
const NOUNS = ['otter', 'harbor', 'cedar', 'falcon', 'meadow', 'quartz', 'willow', 'lumen'];

/** A stable, friendly two-word name derived from an id, for display in place of a raw id. */
export function friendlyName(id: string): string {
  const clean = id.startsWith('0x') ? id.slice(2) : id;
  let a = 0;
  let b = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (i % 2 === 0) {
      a = (a + code) % ADJECTIVES.length;
    } else {
      b = (b + code) % NOUNS.length;
    }
  }
  return `${ADJECTIVES[a]}-${NOUNS[b]}`;
}

/** Compare two Sui addresses canonically (drop 0x, lowercase, pad leading zeros). */
export function sameAddress(a: string, b: string): boolean {
  const norm = (id: string) =>
    (id.startsWith('0x') ? id.slice(2) : id).toLowerCase().padStart(64, '0');
  return norm(a) === norm(b);
}

/** A short, human-scannable form of a long id: 0x1234…cdef. */
export function shortId(id: string): string {
  const clean = id.startsWith('0x') ? id.slice(2) : id;
  if (clean.length <= 10) {
    return `0x${clean}`;
  }
  return `0x${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

/** A snapshot's human label. Seqs are 0-based on chain; people count from one. */
export function snapshotLabel(seq: bigint | number): string {
  return `Snapshot #${BigInt(seq) + 1n}`;
}

/** Relative time like "just now", "3 min ago", "2 days ago". */
export function relativeTime(timestampMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - timestampMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) {
    return 'just now';
  }
  const units: [number, string][] = [
    [60, 'min'],
    [60, 'hr'],
    [24, 'day'],
    [7, 'week'],
  ];
  let value = sec / 60;
  let label = 'min';
  for (let i = 0; i < units.length; i++) {
    label = units[i]?.[1] ?? label;
    const next = units[i + 1]?.[0];
    if (!next || value < next) {
      break;
    }
    value = value / next;
  }
  const rounded = Math.floor(value);
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
}

export type TimelineKind = 'created' | 'checkpoint' | 'fork' | 'grant' | 'revoke';

/** The plain-language title for a timeline event, never a chain term. */
export function eventTitle(kind: TimelineKind): string {
  switch (kind) {
    case 'created':
      return 'Environment created';
    case 'checkpoint':
      return 'Snapshot saved';
    case 'fork':
      return 'Forked from another environment';
    case 'grant':
      return 'Shared with someone';
    case 'revoke':
      return 'Access removed';
  }
}

/** Plain-English label for an access role from its rights bitfield (bit 0 view, bit 1 restore). */
export function roleLabel(rights: number): string {
  return (rights & 2) !== 0 ? 'Can restore' : 'Viewer';
}

/** A human label for a grant's expiry: "No expiry" or "Expires <relative>" / "Expired". */
export function expiryLabel(expiryMs: bigint, nowMs: number): string {
  if (expiryMs === 0n) {
    return 'No expiry';
  }
  const ms = Number(expiryMs);
  return ms <= nowMs ? 'Expired' : `Expires ${relativeFuture(ms, nowMs)}`;
}

function relativeFuture(timestampMs: number, nowMs: number): string {
  const sec = Math.floor((timestampMs - nowMs) / 1000);
  if (sec < 60) {
    return 'in under a minute';
  }
  const mins = Math.floor(sec / 60);
  if (mins < 60) {
    return `in ${mins} min`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `in ${hrs} hr${hrs === 1 ? '' : 's'}`;
  }
  const days = Math.floor(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
