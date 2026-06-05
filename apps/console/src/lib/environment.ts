import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { type Machine, readMachine } from '@reeg/sdk';
import {
  type ForkEvent,
  fetchForkEvent,
  fetchProvenanceEntries,
  reconstructAccessTimeline,
} from '@reeg/verify';
import type { TimelineKind } from './format';

export interface TimelineEvent {
  kind: TimelineKind;
  seq?: bigint;
  blobId?: bigint;
  timestampMs?: bigint;
  parentId?: string;
  /** The address granted or revoked, for grant/revoke events. */
  grantee?: string;
}

/** Everything the environment detail page renders, read straight from Sui. */
export interface EnvironmentView {
  id: string;
  machine: Machine;
  forkEvent: ForkEvent | null;
  events: TimelineEvent[];
}

/**
 * Load an environment for display: the Machine, its provenance timeline, and any fork lineage.
 * Reads only public Sui data; the same data the verifier checks, so the page and the Verify
 * button never disagree.
 */
export async function loadEnvironment(
  client: SuiJsonRpcClient,
  packageId: string,
  id: string,
): Promise<EnvironmentView> {
  const [machine, entries, forkEvent, access] = await Promise.all([
    readMachine(client, id),
    fetchProvenanceEntries(client, packageId, id),
    fetchForkEvent(client, packageId, id),
    reconstructAccessTimeline(client, packageId, id),
  ]);

  // The origin event is first; checkpoints and sharing changes interleave by time after it.
  const origin: TimelineEvent = forkEvent
    ? { kind: 'fork', parentId: forkEvent.parentId }
    : { kind: 'created' };

  const timed: TimelineEvent[] = [
    ...entries.map((entry) => ({
      kind: 'checkpoint' as const,
      seq: entry.seq,
      blobId: entry.blobId,
      timestampMs: entry.timestampMs,
    })),
    ...access.map((record) => ({
      kind: record.kind,
      grantee: record.grantee,
      timestampMs: record.timestampMs,
    })),
  ].sort((a, b) => {
    const at = a.timestampMs ?? 0n;
    const bt = b.timestampMs ?? 0n;
    return at < bt ? -1 : at > bt ? 1 : 0;
  });

  return { id, machine, forkEvent, events: [origin, ...timed] };
}
