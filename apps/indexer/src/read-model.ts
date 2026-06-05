// The indexer's read model: a display-only projection folded from chain events. It is
// rebuildable from events alone and is NEVER on the trust path (the Console verifies against
// Sui directly), so this is plain, deterministic data folding with no authority of its own.

export type ReegEvent =
  | { type: 'created'; machineId: string; owner: string; createdAtEpoch: number }
  | { type: 'checkpoint'; machineId: string; seq: bigint; blobId: bigint; timestampMs: bigint }
  | { type: 'forked'; childId: string; parentId: string };

export interface CheckpointRecord {
  seq: bigint;
  blobId: bigint;
  timestampMs: bigint;
}

export interface EnvironmentRecord {
  id: string;
  owner: string | null;
  createdAtEpoch: number | null;
  parentId: string | null;
  checkpoints: CheckpointRecord[];
}

export type ReadModel = Map<string, EnvironmentRecord>;

function ensure(model: ReadModel, id: string): EnvironmentRecord {
  let record = model.get(id);
  if (!record) {
    record = { id, owner: null, createdAtEpoch: null, parentId: null, checkpoints: [] };
    model.set(id, record);
  }
  return record;
}

/**
 * Fold one event into the model. Tolerant of order (a checkpoint seen before its create still
 * produces a record) and idempotent (re-applying the same checkpoint is a no-op), so a rebuild
 * from the full event log is deterministic regardless of pagination quirks.
 */
export function applyEvent(model: ReadModel, event: ReegEvent): ReadModel {
  if (event.type === 'created') {
    const record = ensure(model, event.machineId);
    record.owner = event.owner;
    record.createdAtEpoch = event.createdAtEpoch;
    return model;
  }
  if (event.type === 'forked') {
    ensure(model, event.childId).parentId = event.parentId;
    return model;
  }
  const record = ensure(model, event.machineId);
  if (!record.checkpoints.some((c) => c.seq === event.seq)) {
    record.checkpoints.push({
      seq: event.seq,
      blobId: event.blobId,
      timestampMs: event.timestampMs,
    });
    record.checkpoints.sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  }
  return model;
}

export function buildModel(events: ReegEvent[]): ReadModel {
  const model: ReadModel = new Map();
  for (const event of events) {
    applyEvent(model, event);
  }
  return model;
}

/** Environments for display, oldest first then by id, so ordering is stable across rebuilds. */
export function listEnvironments(model: ReadModel): EnvironmentRecord[] {
  return [...model.values()].sort((a, b) => {
    const ea = a.createdAtEpoch ?? Number.MAX_SAFE_INTEGER;
    const eb = b.createdAtEpoch ?? Number.MAX_SAFE_INTEGER;
    if (ea !== eb) {
      return ea - eb;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
