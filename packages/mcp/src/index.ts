// @reeg/mcp - the Reeg Model Context Protocol server.
//
// Exposes every Reeg verb (create, run, checkpoint, restore, fork, retire, share/revoke, verify,
// evidence/audit, list) as MCP tools so any agent — Claude Code, a custom agent, an IDE — drives
// the whole loop and "everything it does is reeged". See docs/03-engineering/agent-access.md.
//
// Configuration is by environment (set in the MCP client's server definition), matching @reeg/cli:
//   REEG_NETWORK, REEG_RPC_URL, REEG_PACKAGE_ID, REEG_OPERATOR, REEG_ENGINE, SUI_KEYSTORE,
//   REEG_SEAL_KEY_SERVERS, REEG_SEAL_THRESHOLD, REEG_WALRUS_UPLOAD_RELAY, REEG_HOME.
// Read/verify tools need only network + package id; write tools also need an operator + its key.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server';

async function main(): Promise<void> {
  const server = buildServer();
  // stdio is the protocol channel: tools return results over it, and all logging must go to
  // stderr (a stray stdout write would corrupt the JSON-RPC stream).
  await server.connect(new StdioServerTransport());
  console.error('reeg-mcp: ready on stdio');
}

main().catch((err: unknown) => {
  console.error(`reeg-mcp failed to start: ${(err as Error)?.message ?? String(err)}`);
  process.exit(1);
});
