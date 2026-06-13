import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiConfig } from './config';
import { Paymaster, PaymasterUnavailable } from './enoki';

// Turn a thrown error into one clean JSON response. PaymasterUnavailable -> 503; an Enoki API error
// (it carries a numeric status + code) -> 502 with the upstream detail for debugging; anything else
// -> 500. We never leak the private key — only the upstream's own status/code/message.
function errorResponse(c: Context, err: unknown): Response {
  if (err instanceof PaymasterUnavailable) {
    return c.json({ error: err.message }, 503);
  }
  const e = err as { message?: string; status?: number; code?: string };
  if (typeof e?.status === 'number' && typeof e?.code === 'string') {
    return c.json(
      {
        error: e.message ?? 'Enoki rejected the request',
        enokiStatus: e.status,
        enokiCode: e.code,
      },
      502,
    );
  }
  return c.json({ error: e?.message ?? 'sponsorship failed' }, 500);
}

/**
 * Build the paymaster HTTP app. Two endpoints implement Sui's sponsored-transaction dual-signer
 * flow: the client builds a transaction kind and signs as sender; the paymaster (this service) has
 * Enoki sponsor and pay the gas.
 *
 *   1. POST /sponsor  { transactionKindBytes, sender } -> { bytes, digest }
 *   2. client signs `bytes` with its own (zkLogin) key
 *   3. POST /execute  { digest, signature }            -> { digest }
 */
export function buildApp(config: ApiConfig): Hono {
  const paymaster = new Paymaster(config);
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: config.allowedOrigins,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  // Health/config echo. Reveals readiness, never the key — useful to confirm wiring after deploy.
  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'reeg-paymaster',
      network: config.network,
      packageId: config.packageId || null,
      sponsoredTargets: config.sponsoredTargets.length,
      sponsorshipReady: Boolean(config.enokiSecretKey && config.packageId),
    }),
  );

  app.post('/sponsor', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const { transactionKindBytes, sender } = body as Record<string, unknown>;
    if (typeof transactionKindBytes !== 'string' || typeof sender !== 'string') {
      return c.json(
        { error: 'transactionKindBytes (base64 string) and sender (0x address) are required' },
        400,
      );
    }
    try {
      return c.json(await paymaster.sponsor({ transactionKindBytes, sender }));
    } catch (err) {
      return errorResponse(c, err);
    }
  });

  app.post('/execute', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const { digest, signature } = body as Record<string, unknown>;
    if (typeof digest !== 'string' || typeof signature !== 'string') {
      return c.json({ error: 'digest (string) and signature (string) are required' }, 400);
    }
    try {
      return c.json(await paymaster.execute({ digest, signature }));
    } catch (err) {
      return errorResponse(c, err);
    }
  });

  return app;
}
