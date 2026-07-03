import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  asNetwork,
  loadConfig,
  type ReegConfig,
  requireEncryptionConfig,
  requireOperator,
  resolveConfig,
} from './config';

const ENV_KEYS = [
  'REEG_NETWORK',
  'REEG_RPC_URL',
  'REEG_PACKAGE_ID',
  'REEG_ORIGINAL_PACKAGE_ID',
  'REEG_OPERATOR',
  'REEG_SEAL_KEY_SERVERS',
  'REEG_SEAL_THRESHOLD',
  'REEG_WALRUS_UPLOAD_RELAY',
  'REEG_ENGINE',
];

const BASE: ReegConfig = {
  network: 'testnet',
  rpcUrl: '',
  packageId: '0xpkg',
  originalPackageId: '0xpkg',
  sealKeyServers: [],
  sealThreshold: 1,
  walrusUploadRelay: '',
  operator: '',
  engineBin: 'reeg-engine',
};

// The published Reeg upgrade lineages (latest -> original). Seal rejects an upgraded package id,
// so config must map these silently.
const TESTNET_V2 = '0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2';
const TESTNET_V1 = '0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28';
const MAINNET_V2 = '0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e';
const MAINNET_V1 = '0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3';

describe('loadConfig', () => {
  let saved: Record<string, string | undefined>;

  // Each case must see a clean environment so flag/env/default precedence is what's tested,
  // not whatever the developer's shell happens to export.
  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('requires a package id', () => {
    expect(() => loadConfig({})).toThrow(/package id is required/);
  });

  it('uses verified testnet defaults', () => {
    const config = loadConfig({ package: '0xpkg' });
    expect(config.network).toBe('testnet');
    expect(config.rpcUrl).toContain('testnet');
    expect(config.sealKeyServers.length).toBeGreaterThan(0);
    expect(config.sealThreshold).toBe(1);
    expect(config.walrusUploadRelay).toContain('walrus');
    expect(config.engineBin).toBe('reeg-engine');
  });

  it('prefers flags over env over defaults', () => {
    process.env.REEG_PACKAGE_ID = '0xenvpkg';
    process.env.REEG_OPERATOR = '0xenvop';
    const config = loadConfig({
      package: '0xflagpkg',
      operator: '0xflagop',
      rpc: 'http://localhost:9000',
      network: 'localnet',
    });
    expect(config.packageId).toBe('0xflagpkg');
    expect(config.operator).toBe('0xflagop');
    expect(config.rpcUrl).toBe('http://localhost:9000');
    expect(config.network).toBe('localnet');
  });

  it('reads seal key servers from env as a comma list', () => {
    process.env.REEG_SEAL_KEY_SERVERS = '0xa,0xb';
    expect(loadConfig({ package: '0xpkg' }).sealKeyServers).toEqual(['0xa', '0xb']);
  });

  it('has verified mainnet seal + relay defaults (so a checkpoint is never silently unencrypted)', () => {
    const config = loadConfig({ package: '0xpkg', network: 'mainnet' });
    expect(config.sealKeyServers.length).toBeGreaterThan(0);
    expect(config.walrusUploadRelay).toContain('mainnet');
  });

  it('has no seal or relay defaults on localnet/devnet', () => {
    const config = loadConfig({ package: '0xpkg', network: 'localnet' });
    expect(config.sealKeyServers).toEqual([]);
    expect(config.walrusUploadRelay).toBe('');
  });

  it('maps the upgraded testnet package to its original id for Seal (which rejects upgraded ids)', () => {
    const config = loadConfig({ package: TESTNET_V2 });
    expect(config.packageId).toBe(TESTNET_V2);
    expect(config.originalPackageId).toBe(TESTNET_V1);
  });

  it('maps the upgraded mainnet package to its original id for Seal', () => {
    const config = loadConfig({ package: MAINNET_V2, network: 'mainnet' });
    expect(config.originalPackageId).toBe(MAINNET_V1);
  });

  it('treats an unknown package as its own first version (no cross-package poisoning)', () => {
    const config = loadConfig({ package: '0xabc' });
    expect(config.originalPackageId).toBe('0xabc');
  });

  it('honors an explicit REEG_ORIGINAL_PACKAGE_ID override', () => {
    process.env.REEG_ORIGINAL_PACKAGE_ID = '0xoriginal';
    const config = loadConfig({ package: TESTNET_V2 });
    expect(config.originalPackageId).toBe('0xoriginal');
  });
});

describe('resolveConfig', () => {
  it('does not throw on a missing package id (so doctor can report it)', () => {
    const config = resolveConfig({});
    expect(config.packageId).toBe('');
    expect(config.network).toBe('testnet');
  });
});

describe('requireEncryptionConfig', () => {
  const base: ReegConfig = {
    network: 'localnet',
    rpcUrl: '',
    packageId: '0xpkg',
    originalPackageId: '0xpkg',
    sealKeyServers: [],
    sealThreshold: 1,
    walrusUploadRelay: '',
    operator: '',
    engineBin: 'reeg-engine',
  };

  it('throws when no key servers are configured (refuses to checkpoint unencrypted)', () => {
    expect(() => requireEncryptionConfig(base)).toThrow(/cannot be\s+encrypted/);
  });

  it('passes when at least one key server is configured', () => {
    expect(() => requireEncryptionConfig({ ...base, sealKeyServers: ['0xa'] })).not.toThrow();
  });
});

describe('requireOperator', () => {
  it('throws when the operator is missing', () => {
    expect(() => requireOperator({ ...BASE, operator: '' })).toThrow(
      /operator address is required/,
    );
  });
  it('returns the operator when present', () => {
    expect(requireOperator({ ...BASE, operator: '0xop' })).toBe('0xop');
  });
});

describe('asNetwork', () => {
  it('accepts known networks', () => {
    expect(asNetwork('testnet')).toBe('testnet');
    expect(asNetwork('mainnet')).toBe('mainnet');
  });
  it('rejects an unknown network', () => {
    expect(() => asNetwork('foonet')).toThrow(/unknown network/);
  });
});
