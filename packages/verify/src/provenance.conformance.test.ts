import { describe, expect, it } from 'vitest';
import { toHex } from './hash';
import {
  computeEntryHash,
  computeForkChildHead,
  EVENT_CHECKPOINT,
  EVENT_GRANT,
  EVENT_RETIRE,
  EVENT_REVOKE,
  genesisHead,
} from './provenance';

// These vectors are pinned identically in Move tests (machine.move). Both sides recompute the
// same hashes for the same inputs, so if Move's blake2b256 or the BCS preimage ever diverges
// from this TS code, exactly one side fails. That is the cross-language guarantee the verifier
// rests on. Inputs use byte ranges that are trivial to mirror as Move x"..." literals.
const range = (start: number, end: number) =>
  Uint8Array.from(Array.from({ length: end - start }, (_, i) => start + i));

const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;

describe('cross-language conformance with the Move package', () => {
  it('entry hash matches the shared vector', () => {
    const head = computeEntryHash(range(0, 32), {
      seq: 0n,
      eventType: EVENT_CHECKPOINT,
      blobId: 1n,
      manifestHash: new TextEncoder().encode('manifest'),
      payloadHash: new TextEncoder().encode('payload'),
      timestampMs: 0n,
    });
    expect(toHex(head)).toBe('bb2d11a7d28d786b7ca7e4590553208612020e5b8ad123f597e0f753003c3e4c');
  });

  it('entry hash matches the shared vector at max u64/u256 (full-width BCS)', () => {
    const head = computeEntryHash(range(0, 32), {
      seq: U64_MAX,
      eventType: EVENT_CHECKPOINT,
      blobId: U256_MAX,
      manifestHash: new TextEncoder().encode('m'),
      payloadHash: new TextEncoder().encode('p'),
      timestampMs: U64_MAX,
    });
    expect(toHex(head)).toBe('22a696d2fe777f14477218356cc23e438c8a37dad3e174e34242349c742e89aa');
  });

  it('genesis head matches the shared vector', () => {
    expect(toHex(genesisHead(range(0, 32)))).toBe(
      'cb2f5160fc1f7e05a55ef49d340b48da2e5a78099d53393351cd579dd42503d6',
    );
  });

  it('fork child-head binding matches the shared vector', () => {
    expect(toHex(computeForkChildHead(range(0, 32), range(32, 64)))).toBe(
      '21f0a84638c2a3e48557c06cbe37505f2548410513851a1935fb1d1c574ff6d4',
    );
  });

  // A grant entry: event_type GRANT, blob 0, empty manifest. Pinned identically in machine.move
  // (grant_entry_hash_matches_cross_language_vector), so a drift in either side fails one test.
  it('grant entry hash matches the shared vector', () => {
    const head = computeEntryHash(range(0, 32), {
      seq: 0n,
      eventType: EVENT_GRANT,
      blobId: 0n,
      manifestHash: new Uint8Array(0),
      payloadHash: new TextEncoder().encode('grant'),
      timestampMs: 0n,
    });
    expect(toHex(head)).toBe('f68372b4bf4b919c8d5e1c4ce25d3c59dde097cd1af20ef46445092c9a7f23e0');
  });

  it('revoke entry hash matches the shared vector', () => {
    const head = computeEntryHash(range(0, 32), {
      seq: 0n,
      eventType: EVENT_REVOKE,
      blobId: 0n,
      manifestHash: new Uint8Array(0),
      payloadHash: new TextEncoder().encode('revoke'),
      timestampMs: 0n,
    });
    expect(toHex(head)).toBe('d445029dd79d54c5d73265cc8671637f9054e6525e9cdb7cd81f003ee1fc4241');
  });

  // A retire entry: event_type RETIRE (5), blob 0, empty manifest. Pinned identically in
  // machine.move (retire_entry_hash_matches_cross_language_vector).
  it('retire entry hash matches the shared vector', () => {
    const head = computeEntryHash(range(0, 32), {
      seq: 0n,
      eventType: EVENT_RETIRE,
      blobId: 0n,
      manifestHash: new Uint8Array(0),
      payloadHash: new TextEncoder().encode('retire'),
      timestampMs: 0n,
    });
    expect(toHex(head)).toBe('74889391f2f4aec2dc187296703dd2bd2d17a2e031418b86fe2616d97dc30291');
  });
});
