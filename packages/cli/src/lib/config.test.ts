import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asNetwork, loadConfig, type ReegConfig, requireOperator } from './config';

const ENV_KEYS = [
  'REEG_NETWORK',
  'REEG_RPC_URL',
  'REEG_PACKAGE_ID',
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
  sealKeyServers: [],
  sealThreshold: 1,
  walrusUploadRelay: '',
  operator: '',
  engineBin: 'reeg-engine',
};

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

  it('has no built-in seal or relay defaults off testnet', () => {
    const config = loadConfig({ package: '0xpkg', network: 'mainnet' });
    expect(config.sealKeyServers).toEqual([]);
    expect(config.walrusUploadRelay).toBe('');
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
