import { describe, expect, it } from 'vitest';
import {
  collectHeads,
  computeEntryHash,
  EVENT_CHECKPOINT,
  EVENT_GRANT,
  EVENT_REVOKE,
  genesisHead,
  type LinkedEntry,
  orderByLinkage,
  type ProvenanceEntry,
} from './provenance';

const GENESIS = genesisHead(Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1)));

function entry(eventType: number, seq: number, blobId: bigint): ProvenanceEntry {
  return {
    seq: BigInt(seq),
    eventType,
    blobId,
    manifestHash: Uint8Array.of(seq),
    payloadHash: Uint8Array.of(eventType, seq),
    timestampMs: BigInt(1000 + seq),
  };
}

// Build the linked form (each entry plus its prev/new heads) from a chain in true order.
function link(genesis: Uint8Array, entries: ProvenanceEntry[]): LinkedEntry[] {
  const heads = collectHeads(genesis, entries);
  return entries.map((e, i) => ({
    entry: e,
    prevHead: heads[i] as Uint8Array,
    newHead: heads[i + 1] as Uint8Array,
  }));
}

describe('orderByLinkage', () => {
  // A grant and a revoke share a seq with the next checkpoint, so seq order is ambiguous.
  const ordered = [
    entry(EVENT_CHECKPOINT, 0, 100n),
    entry(EVENT_GRANT, 1, 0n),
    entry(EVENT_CHECKPOINT, 1, 200n),
    entry(EVENT_REVOKE, 2, 0n),
    entry(EVENT_CHECKPOINT, 2, 300n),
  ];

  it('reconstructs the true chain order from a shuffled set', () => {
    const links = link(GENESIS, ordered);
    const shuffled = [links[3], links[0], links[4], links[1], links[2]] as LinkedEntry[];
    const result = orderByLinkage(GENESIS, shuffled);
    expect(result).toEqual(ordered);
  });

  it('returns an empty list when nothing links from the genesis', () => {
    const links = link(GENESIS, ordered);
    const orphans = links.slice(2); // drop the entries that chain from genesis
    expect(orderByLinkage(GENESIS, orphans)).toEqual([]);
  });

  it('stops at a broken link, dropping entries past the gap', () => {
    const links = link(GENESIS, ordered);
    // Remove the middle checkpoint: the chain links up to the grant, then cannot continue.
    const withGap = [links[0], links[1], links[3], links[4]] as LinkedEntry[];
    const result = orderByLinkage(GENESIS, withGap);
    expect(result).toEqual([ordered[0], ordered[1]]);
  });

  it('is order-independent: the same head replays regardless of input order', () => {
    const links = link(GENESIS, ordered);
    const a = orderByLinkage(GENESIS, links);
    const b = orderByLinkage(GENESIS, [...links].reverse());
    const replay = (es: ProvenanceEntry[]) => es.reduce((h, e) => computeEntryHash(h, e), GENESIS);
    expect(replay(a)).toEqual(replay(b));
  });
});
