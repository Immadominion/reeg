// @reeg/api - the Reeg paymaster backend.
//
// Today: Enoki-sponsored Sui gas for Reeg's package functions (so a user/agent holds no SUI).
// Next: zkLogin helpers, sponsored Walrus storage (a server-held WAL signer), and metering/billing.
// This is the only privileged Reeg service. Verification never depends on it — a past run still
// verifies offline from public Sui with this stopped. See docs/03-engineering/agent-access.md.
//
// Configuration is by environment (see .env.example): ENOKI_SECRET_KEY (the private key — server
// only, never the frontend), ENOKI_NETWORK, REEG_PACKAGE_ID, REEG_SPONSORED_TARGETS,
// REEG_ALLOWED_ORIGINS, PORT.

import 'dotenv/config';
import { serve } from '@hono/node-server';
import { buildApp } from './app';
import { loadApiConfig } from './config';

const config = loadApiConfig();
const app = buildApp(config);

if (!config.enokiSecretKey) {
  console.warn(
    'reeg-paymaster: WARNING ENOKI_SECRET_KEY not set — /sponsor and /execute return 503',
  );
}
if (!config.packageId) {
  console.warn(
    'reeg-paymaster: WARNING REEG_PACKAGE_ID not set — sponsorship fails until configured',
  );
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`reeg-paymaster: listening on :${info.port} (network ${config.network})`);
});
