import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { ApiConfig } from './config';

const base: ApiConfig = {
  port: 8787,
  network: 'testnet',
  enokiSecretKey: '',
  packageId: '0xpkg',
  sponsoredTargets: ['0xpkg::access::grant'],
  allowedOrigins: ['*'],
};

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('paymaster app', () => {
  it('GET /health reports readiness without leaking the key', async () => {
    const app = buildApp({ ...base, enokiSecretKey: 'enoki_private_secret' });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.sponsorshipReady).toBe(true);
    // the key must never appear in any response.
    expect(JSON.stringify(body)).not.toContain('enoki_private_secret');
  });

  it('POST /sponsor rejects a malformed body with 400', async () => {
    const res = await buildApp(base).request('/sponsor', json({ sender: '0xabc' }));
    expect(res.status).toBe(400);
  });

  it('POST /sponsor returns 503 when no Enoki key is configured', async () => {
    const res = await buildApp(base).request(
      '/sponsor',
      json({ transactionKindBytes: 'AAAA', sender: '0xabc' }),
    );
    expect(res.status).toBe(503);
  });

  it('POST /execute rejects a malformed body with 400', async () => {
    const res = await buildApp(base).request('/execute', json({}));
    expect(res.status).toBe(400);
  });
});
