import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asEnokiNetwork, loadApiConfig } from './config';

const KEYS = [
  'ENOKI_NETWORK',
  'ENOKI_SECRET_KEY',
  'REEG_PACKAGE_ID',
  'REEG_SPONSORED_TARGETS',
  'REEG_ALLOWED_ORIGINS',
  'PORT',
];

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

describe('loadApiConfig', () => {
  it('defaults to testnet, port 8787, no key/package, and the Console origins', () => {
    const config = loadApiConfig();
    expect(config.network).toBe('testnet');
    expect(config.port).toBe(8787);
    expect(config.enokiSecretKey).toBe('');
    expect(config.packageId).toBe('');
    expect(config.sponsoredTargets).toEqual([]); // no package id -> no targets
    expect(config.allowedOrigins).toContain('https://app.reeg.xyz');
  });

  it('builds the Reeg-only sponsored allowlist from the package id', () => {
    process.env.REEG_PACKAGE_ID = '0xpkg';
    process.env.ENOKI_SECRET_KEY = 'enoki_private_x';
    const config = loadApiConfig();
    expect(config.sponsoredTargets).toHaveLength(7);
    expect(config.sponsoredTargets).toContain('0xpkg::machine::register_checkpoint');
    expect(config.sponsoredTargets).toContain('0xpkg::access::grant');
    // every target is scoped to the configured package — no unconstrained sponsorship.
    expect(config.sponsoredTargets.every((t) => t.startsWith('0xpkg::'))).toBe(true);
    expect(config.enokiSecretKey).toBe('enoki_private_x');
  });

  it('honors a REEG_SPONSORED_TARGETS override, still package-scoped', () => {
    process.env.REEG_PACKAGE_ID = '0xpkg';
    process.env.REEG_SPONSORED_TARGETS = 'machine::register_checkpoint, access::grant';
    const config = loadApiConfig();
    expect(config.sponsoredTargets).toEqual([
      '0xpkg::machine::register_checkpoint',
      '0xpkg::access::grant',
    ]);
  });
});

describe('asEnokiNetwork', () => {
  it('accepts the Enoki-supported networks', () => {
    expect(asEnokiNetwork('mainnet')).toBe('mainnet');
    expect(asEnokiNetwork('testnet')).toBe('testnet');
    expect(asEnokiNetwork('devnet')).toBe('devnet');
  });

  it('rejects localnet and unknown networks', () => {
    expect(() => asEnokiNetwork('localnet')).toThrow(/localnet/);
    expect(() => asEnokiNetwork('foonet')).toThrow(/unsupported/);
  });
});
