import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { ReegEvent } from './read-model';

interface CreatedJson {
  machine_id: string;
  owner: string;
  created_at_epoch: number | string;
}
interface CheckpointJson {
  machine_id: string;
  seq: string;
  blob_id: string;
  timestamp_ms: string;
}
interface ForkedJson {
  child_id: string;
  parent_id: string;
}

async function queryAll<T>(
  client: SuiJsonRpcClient,
  eventType: string,
  map: (json: T) => ReegEvent,
): Promise<ReegEvent[]> {
  const out: ReegEvent[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined;
  do {
    const page = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      order: 'ascending',
    });
    for (const event of page.data) {
      out.push(map(event.parsedJson as T));
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return out;
}

/**
 * Read every Machine event for a package and map it to the model's event union. Created and
 * fork events are returned before checkpoints so a record exists before its checkpoints fold
 * in (the model tolerates the other order too).
 */
export async function fetchEvents(
  client: SuiJsonRpcClient,
  packageId: string,
): Promise<ReegEvent[]> {
  const created = await queryAll<CreatedJson>(
    client,
    `${packageId}::machine::MachineCreated`,
    (j) => ({
      type: 'created',
      machineId: j.machine_id,
      owner: j.owner,
      createdAtEpoch: Number(j.created_at_epoch),
    }),
  );
  const forked = await queryAll<ForkedJson>(
    client,
    `${packageId}::machine::MachineForked`,
    (j) => ({ type: 'forked', childId: j.child_id, parentId: j.parent_id }),
  );
  const checkpoints = await queryAll<CheckpointJson>(
    client,
    `${packageId}::machine::CheckpointRegistered`,
    (j) => ({
      type: 'checkpoint',
      machineId: j.machine_id,
      seq: BigInt(j.seq),
      blobId: BigInt(j.blob_id),
      timestampMs: BigInt(j.timestamp_ms),
    }),
  );
  return [...created, ...forked, ...checkpoints];
}
