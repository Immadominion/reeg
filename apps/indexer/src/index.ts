// @reeg/indexer - display-only indexer of Machine + provenance events.
//
// Reads Sui events to build a fast read model for the Console. It is rebuildable from chain
// events and is NEVER on the trust path: verification always works reading Sui + Walrus
// directly, so nothing critical depends on this database being authoritative
// (docs/02-architecture/security-and-threat-model.md). This entry builds the model once and
// prints a summary; the read model is exported for use by a server or the Console's cache.

import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { originalPackageId } from '@reeg/chain';
import { buildIndex } from './indexer';
import { listEnvironments } from './read-model';

export { fetchEvents } from './events';
export { buildIndex } from './indexer';
export {
  applyEvent,
  buildModel,
  type CheckpointRecord,
  type EnvironmentRecord,
  listEnvironments,
  type ReadModel,
  type ReegEvent,
} from './read-model';

type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

function asNetwork(value: string | undefined): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  return 'testnet';
}

async function main() {
  const network = asNetwork(process.env.REEG_NETWORK);
  const packageId = process.env.REEG_PACKAGE_ID;
  if (!packageId) {
    console.error('error: REEG_PACKAGE_ID is required');
    process.exitCode = 1;
    return;
  }
  const client = new SuiJsonRpcClient({
    url: process.env.REEG_RPC_URL ?? getJsonRpcFullnodeUrl(network),
    network,
  });

  // Events are tagged with the DEFINING (original) package id; an upgraded id finds nothing.
  const model = await buildIndex(client, originalPackageId(packageId));
  const environments = listEnvironments(model);
  console.log(`reeg indexer: ${environments.length} environment(s) on ${network}`);
  for (const env of environments) {
    console.log(
      `  ${env.id} — ${env.checkpoints.length} snapshot(s)${env.parentId ? ' (forked)' : ''}`,
    );
  }
}

// Run only when invoked directly, so the read-model exports stay importable without side effects.
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
