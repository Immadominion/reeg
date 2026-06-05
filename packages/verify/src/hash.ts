import { blake2b } from '@noble/hashes/blake2.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/** BLAKE3-256 over bytes, matching the Rust engine's content hashing (manifest, files). */
export function blake3Hash(data: Uint8Array): Uint8Array {
  return blake3(data);
}

/** BLAKE2b with a 256-bit digest, matching Sui Move's `sui::hash::blake2b256`, which the
 *  Machine package uses for the on-chain provenance chain. The default blake2b digest is 64
 *  bytes, so the 32-byte length is mandatory for parity. */
export function blake2b256(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}

export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

export function fromHex(hex: string): Uint8Array {
  return hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex);
}

// One shared encoder: TextEncoder is stateless, and canonicalization sorts with this
// comparator O(n log n) times, so allocating per call would be wasteful.
const SHARED_UTF8 = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return SHARED_UTF8.encode(text);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Compare two strings by their UTF-8 byte sequences, matching Rust's `Ord for String` and
 * `Ord for str`. JavaScript's default sort compares UTF-16 code units, which differs from
 * Rust for non-ASCII input, so the engine's sort order is reproduced exactly here.
 */
export function compareUtf8(a: string, b: string): number {
  const ea = utf8(a);
  const eb = utf8(b);
  const len = Math.min(ea.length, eb.length);
  for (let i = 0; i < len; i++) {
    const diff = (ea[i] as number) - (eb[i] as number);
    if (diff !== 0) {
      return diff;
    }
  }
  return ea.length - eb.length;
}
