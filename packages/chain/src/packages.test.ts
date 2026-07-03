import { describe, expect, it } from 'vitest';
import { originalPackageId } from './packages';

const TESTNET_V2 = '0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2';
const TESTNET_V1 = '0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28';
const MAINNET_V2 = '0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e';
const MAINNET_V1 = '0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3';

describe('originalPackageId', () => {
  it('maps the upgraded testnet package to its first-published id', () => {
    expect(originalPackageId(TESTNET_V2)).toBe(TESTNET_V1);
  });

  it('maps the upgraded mainnet package to its first-published id', () => {
    expect(originalPackageId(MAINNET_V2)).toBe(MAINNET_V1);
  });

  it('normalizes the id before the lineage lookup', () => {
    expect(originalPackageId(TESTNET_V2.toUpperCase().replace('0X', '0x'))).toBe(TESTNET_V1);
  });

  it('returns an unknown package unchanged (it is its own first version)', () => {
    expect(originalPackageId('0xabc')).toBe('0xabc');
  });

  it('returns an empty id unchanged', () => {
    expect(originalPackageId('')).toBe('');
  });
});
