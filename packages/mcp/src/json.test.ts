import { describe, expect, it } from 'vitest';
import { jsonReplacer, jsonText } from './json';

describe('jsonReplacer', () => {
  it('renders a bigint as a decimal string', () => {
    expect(jsonReplacer('k', 42n)).toBe('42');
  });

  it('renders a Uint8Array as hex', () => {
    expect(jsonReplacer('k', new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
  });

  it('passes other values through untouched', () => {
    expect(jsonReplacer('k', 'plain')).toBe('plain');
    expect(jsonReplacer('k', 7)).toBe(7);
    expect(jsonReplacer('k', null)).toBeNull();
  });
});

describe('jsonText', () => {
  it('serializes the on-chain types our readers return (bigint, bytes) deterministically', () => {
    // Mirrors a reeg_get / reeg_verify payload: bigint counts and Uint8Array hashes.
    const text = jsonText({
      checkpointCount: 3n,
      provenanceHead: new Uint8Array([1, 2, 3]),
      id: 'm',
    });
    expect(JSON.parse(text)).toEqual({ checkpointCount: '3', provenanceHead: '010203', id: 'm' });
  });
});
