import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asNetwork, requireOperator, requirePackage, resolveConfig } from './config';

const KEYS = [
  'REEG_NETWORK',
  'REEG_RPC_URL',
  'REEG_PACKAGE_ID',
  'REEG_OPERATOR',
  'REEG_ENGINE',
  'REEG_SEAL_KEY_SERVERS',
  'REEG_SEAL_THRESHOLD',
  'REEG_WALRUS_UPLOAD_RELAY',
];

// Snapshot and clear the REEG_* env so each case starts from a known baseline, then restore.
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

describe('resolveConfig', () => {
  it('defaults to testnet with the verified key server + relay, and no package/operator', () => {
    const config = resolveConfig();
    expect(config.network).toBe('testnet');
    expect(config.sealKeyServers).toHaveLength(1);
    expect(config.walrusUploadRelay).toContain('testnet');
    expect(config.sealThreshold).toBe(1);
    expect(config.engineBin).toBe('reeg-engine');
    expect(config.packageId).toBe('');
    expect(config.operator).toBe('');
  });

  it('lets a per-call override beat the env', () => {
    process.env.REEG_NETWORK = 'testnet';
    process.env.REEG_PACKAGE_ID = '0xfromenv';
    const config = resolveConfig({ network: 'mainnet', package: '0xfromarg' });
    expect(config.network).toBe('mainnet');
    expect(config.packageId).toBe('0xfromarg');
    // mainnet has no hardcoded seal/relay defaults; only testnet does.
    expect(config.sealKeyServers).toEqual([]);
    expect(config.walrusUploadRelay).toBe('');
  });

  it('reads operator, engine, and a custom key-server list from the env', () => {
    process.env.REEG_OPERATOR = '0xoperator';
    process.env.REEG_ENGINE = '/usr/local/bin/reeg-engine';
    process.env.REEG_SEAL_KEY_SERVERS = '0xaaa,0xbbb';
    process.env.REEG_SEAL_THRESHOLD = '2';
    const config = resolveConfig();
    expect(config.operator).toBe('0xoperator');
    expect(config.engineBin).toBe('/usr/local/bin/reeg-engine');
    expect(config.sealKeyServers).toEqual(['0xaaa', '0xbbb']);
    expect(config.sealThreshold).toBe(2);
  });
});

describe('requirePackage / requireOperator', () => {
  it('throw a clear error when missing', () => {
    expect(() => requirePackage(resolveConfig())).toThrow(/package id/);
    expect(() => requireOperator(resolveConfig())).toThrow(/signing address/);
  });

  it('return the value when present', () => {
    expect(requirePackage(resolveConfig({ package: '0xpkg' }))).toBe('0xpkg');
    expect(requireOperator(resolveConfig({ operator: '0xop' }))).toBe('0xop');
  });
});

describe('asNetwork', () => {
  it('accepts the known networks', () => {
    expect(asNetwork('mainnet')).toBe('mainnet');
    expect(asNetwork('localnet')).toBe('localnet');
  });

  it('rejects an unknown network', () => {
    expect(() => asNetwork('foonet')).toThrow(/unknown network/);
  });
});
