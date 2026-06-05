import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { fetchEvents } from './events';
import { buildModel, type ReadModel } from './read-model';

/**
 * Build the full read model for a package by replaying its events. Because the model is
 * rebuildable from events and never authoritative, an indexer restart simply replays from the
 * chain; nothing critical depends on a persisted database.
 */
export async function buildIndex(client: SuiJsonRpcClient, packageId: string): Promise<ReadModel> {
  const events = await fetchEvents(client, packageId);
  return buildModel(events);
}
