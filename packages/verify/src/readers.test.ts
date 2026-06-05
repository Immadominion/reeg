import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { describe, expect, it } from 'vitest';
import {
  computeEntryHash,
  computeForkChildHead,
  EVENT_GRANT,
  EVENT_RETIRE,
  EVENT_REVOKE,
  genesisHead,
  type ProvenanceEntry,
} from './provenance';
import {
  anchorEvidence,
  exportEvidence,
  fetchForkEvent,
  fetchProvenanceEntries,
  isRetired,
  machineIdBytes,
  reconstructAccessTimeline,
  verifyFromChain,
} from './readers';

const PKG = `0x${'9'.repeat(64)}`;
const P_ID = `0x${'11'.repeat(32)}`;
const C_ID = `0x${'22'.repeat(32)}`;
const M_ID = `0x${'33'.repeat(32)}`;
const DECOY_ID = `0x${'99'.repeat(32)}`;
const BOB = `0x${'b0'.repeat(32)}`;

type Fields = Record<string, unknown>;
type EventJson = Record<string, unknown>;

// A minimal in-memory Sui client: getObject looks up a fields map, queryEvents paginates the
// events of the requested type one per page (so the cursor loop is genuinely exercised).
function makeClient(opts: {
  objects: Record<string, Fields>;
  checkpoints?: EventJson[];
  forks?: EventJson[];
  granted?: EventJson[];
  revoked?: EventJson[];
  retired?: EventJson[];
}): SuiJsonRpcClient {
  const byType = (t: string) => {
    if (t.endsWith('::CheckpointRegistered')) return opts.checkpoints ?? [];
    if (t.endsWith('::MachineForked')) return opts.forks ?? [];
    if (t.endsWith('::AccessGranted')) return opts.granted ?? [];
    if (t.endsWith('::AccessRevoked')) return opts.revoked ?? [];
    if (t.endsWith('::MachineRetired')) return opts.retired ?? [];
    return [];
  };

  const stub = {
    async getObject({ id }: { id: string }) {
      const fields = opts.objects[id];
      return fields ? { data: { content: { dataType: 'moveObject', fields } } } : { data: null };
    },
    async queryEvents({
      query,
      cursor,
    }: {
      query: { MoveEventType: string };
      cursor?: { eventSeq: string } | null;
    }) {
      const all = byType(query.MoveEventType);
      const start = cursor ? Number(cursor.eventSeq) + 1 : 0;
      const item = all[start];
      if (item === undefined) {
        return { data: [], hasNextPage: false, nextCursor: null };
      }
      return {
        data: [{ parsedJson: item }],
        hasNextPage: start + 1 < all.length,
        nextCursor: { txDigest: 'd', eventSeq: String(start) },
      };
    },
  };
  return stub as unknown as SuiJsonRpcClient;
}

function machineFields(over: Partial<Record<string, unknown>>): Fields {
  return {
    owner: '0xowner',
    current_blob_id: '0',
    manifest_hash: [],
    provenance_head: [],
    checkpoint_count: '0',
    parent: null,
    policy_id: '0xpolicy',
    created_at_epoch: 1,
    ...over,
  };
}

function checkpointJson(
  machineId: string,
  seq: number,
  blobId: bigint,
  manifestHash: unknown,
  prevHead: Uint8Array,
  newHead: Uint8Array,
): EventJson {
  return {
    machine_id: machineId,
    seq: String(seq),
    blob_id: blobId.toString(),
    manifest_hash: manifestHash,
    payload_hash: [seq],
    prev_head: Array.from(prevHead),
    new_head: Array.from(newHead),
    timestamp_ms: String(1000 + seq),
  };
}

function accessJson(
  machineId: string,
  grantee: string,
  seq: number,
  payloadByte: number,
  prevHead: Uint8Array,
  newHead: Uint8Array,
  timestampMs: number,
  extra: EventJson = {},
): EventJson {
  return {
    machine_id: machineId,
    policy_id: '0xpolicy',
    grantee,
    seq: String(seq),
    blob_id: '0',
    manifest_hash: [],
    payload_hash: [payloadByte],
    prev_head: Array.from(prevHead),
    new_head: Array.from(newHead),
    timestamp_ms: String(timestampMs),
    ...extra,
  };
}

function checkpointEntry(seq: number, blobId: bigint, manifest: Uint8Array): ProvenanceEntry {
  return {
    seq: BigInt(seq),
    eventType: 0,
    blobId,
    manifestHash: manifest,
    payloadHash: Uint8Array.of(seq),
    timestampMs: BigInt(1000 + seq),
  };
}

function accessEntry(eventType: number, seq: number, payloadByte: number): ProvenanceEntry {
  return {
    seq: BigInt(seq),
    eventType,
    blobId: 0n,
    manifestHash: new Uint8Array(0),
    payloadHash: Uint8Array.of(payloadByte),
    timestampMs: BigInt(1000 + seq),
  };
}

// A valid fork scenario: parent P with one checkpoint, child C forked from P's head with its
// own checkpoint. Returns a wired stub client plus the on-chain heads for assertions.
function forkScenario() {
  const genesisP = genesisHead(machineIdBytes(P_ID));
  const pEntry = checkpointEntry(0, 100n, Uint8Array.of(1, 2, 3));
  const parentHead = computeEntryHash(genesisP, pEntry);
  const childHead = computeForkChildHead(parentHead, machineIdBytes(C_ID));
  const cEntry = checkpointEntry(0, 200n, Uint8Array.of(5, 6, 7));
  const childHeadAfter = computeEntryHash(childHead, cEntry);

  const objects: Record<string, Fields> = {
    [P_ID]: machineFields({
      current_blob_id: '100',
      manifest_hash: [1, 2, 3],
      provenance_head: Array.from(parentHead),
      checkpoint_count: '1',
      parent: null,
    }),
    [C_ID]: machineFields({
      current_blob_id: '200',
      manifest_hash: [5, 6, 7],
      provenance_head: Array.from(childHeadAfter),
      checkpoint_count: '1',
      parent: P_ID,
    }),
  };

  const checkpoints = [
    checkpointJson(P_ID, 0, 100n, [1, 2, 3], genesisP, parentHead),
    checkpointJson(DECOY_ID, 0, 999n, [0], genesisP, parentHead), // filtered out by machine id
    // hex-string encoding of the child manifest hash exercises parseBytes' string branch
    checkpointJson(C_ID, 0, 200n, '0x050607', childHead, childHeadAfter),
  ];
  const forks = [
    {
      child_id: C_ID,
      parent_id: P_ID,
      parent_head: Array.from(parentHead),
      child_head: Array.from(childHead),
    },
  ];

  return { client: makeClient({ objects, checkpoints, forks }), parentHead, childHead };
}

// A linear machine M with an interleaved chain: checkpoint, grant, checkpoint, revoke. The grant
// and revoke share a seq with the following checkpoint (seq = checkpoint_count at the time), so
// only the hash linkage, not the seq, gives the true order.
function interleavedScenario() {
  const genesis = genesisHead(machineIdBytes(M_ID));
  const c0 = checkpointEntry(0, 100n, Uint8Array.of(1, 2, 3));
  const h1 = computeEntryHash(genesis, c0);
  const g = accessEntry(EVENT_GRANT, 1, 7);
  const h2 = computeEntryHash(h1, g);
  const c1 = checkpointEntry(1, 200n, Uint8Array.of(5, 6, 7));
  const h3 = computeEntryHash(h2, c1);
  const r = accessEntry(EVENT_REVOKE, 2, 8);
  const h4 = computeEntryHash(h3, r);

  const objects: Record<string, Fields> = {
    [M_ID]: machineFields({
      current_blob_id: '200',
      manifest_hash: [5, 6, 7],
      provenance_head: Array.from(h4),
      checkpoint_count: '2',
      parent: null,
    }),
  };
  const checkpoints = [
    checkpointJson(M_ID, 0, 100n, [1, 2, 3], genesis, h1),
    checkpointJson(M_ID, 1, 200n, [5, 6, 7], h2, h3),
  ];
  // The event timestamp must equal the one the entry was hashed with (1000 + seq), or the
  // rebuilt entry would not replay to the recorded head.
  const granted = [accessJson(M_ID, BOB, 1, 7, h1, h2, 1001, { rights: '2', expiry_ms: '0' })];
  const revoked = [accessJson(M_ID, BOB, 2, 8, h3, h4, 1002)];

  return { objects, checkpoints, granted, revoked, h4 };
}

describe('fetchProvenanceEntries', () => {
  it('filters by machine id, decodes both byte encodings, and sorts by seq', async () => {
    const { client } = forkScenario();
    const childEntries = await fetchProvenanceEntries(client, PKG, C_ID);
    expect(childEntries).toHaveLength(1);
    expect(childEntries[0]?.blobId).toBe(200n);
    expect(Array.from(childEntries[0]?.manifestHash ?? [])).toEqual([5, 6, 7]); // from hex
    const parentEntries = await fetchProvenanceEntries(client, PKG, P_ID);
    expect(parentEntries).toHaveLength(1);
    expect(parentEntries[0]?.blobId).toBe(100n);
  });
});

describe('fetchForkEvent', () => {
  it('returns the lineage for a forked child', async () => {
    const { client, parentHead, childHead } = forkScenario();
    const fork = await fetchForkEvent(client, PKG, C_ID);
    expect(fork?.parentId).toBe(P_ID);
    expect(Array.from(fork?.parentHead ?? [])).toEqual(Array.from(parentHead));
    expect(Array.from(fork?.childHead ?? [])).toEqual(Array.from(childHead));
  });

  it('returns null for a Machine that was never forked', async () => {
    const { client } = forkScenario();
    expect(await fetchForkEvent(client, PKG, P_ID)).toBeNull();
  });
});

describe('verifyFromChain', () => {
  it('verifies a linear parent', async () => {
    const { client } = forkScenario();
    const report = await verifyFromChain(client, PKG, P_ID);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
  });

  it('verifies a forked child including the lineage binding', async () => {
    const { client } = forkScenario();
    const report = await verifyFromChain(client, PKG, C_ID);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['fork-binding', 'fork-parent-head']),
    );
  });

  it('verifies a chain with interleaved grant and revoke entries', async () => {
    const { objects, checkpoints, granted, revoked } = interleavedScenario();
    const client = makeClient({ objects, checkpoints, granted, revoked });
    const report = await verifyFromChain(client, PKG, M_ID);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
    // checkpoint counting and contiguity ignore the access entries.
    const byName = (n: string) => report.checks.find((c) => c.name === n);
    expect(byName('checkpoint-count')?.passed).toBe(true);
    expect(byName('sequence-contiguous')?.passed).toBe(true);
  });

  it('fails if a grant entry is dropped, because the head no longer replays', async () => {
    const { objects, checkpoints, revoked } = interleavedScenario();
    // Omit the grant event: the verifier cannot reach the on-chain head without it.
    const client = makeClient({ objects, checkpoints, granted: [], revoked });
    const report = await verifyFromChain(client, PKG, M_ID);
    expect(report.ok).toBe(false);
    expect(report.checks.filter((c) => !c.passed).map((c) => c.name)).toContain('provenance-head');
  });

  it('fails if a grant entry is tampered with', async () => {
    const { objects, checkpoints, granted, revoked } = interleavedScenario();
    const tampered = granted.map((g) => ({ ...g, payload_hash: [123] }));
    const client = makeClient({ objects, checkpoints, granted: tampered, revoked });
    const report = await verifyFromChain(client, PKG, M_ID);
    expect(report.ok).toBe(false);
    expect(report.checks.filter((c) => !c.passed).map((c) => c.name)).toContain('provenance-head');
  });

  it('fails clearly when a Machine claims a parent but has no fork event', async () => {
    const objects = { [C_ID]: machineFields({ parent: P_ID }) };
    const client = makeClient({ objects });
    const report = await verifyFromChain(client, PKG, C_ID);
    expect(report.ok).toBe(false);
    expect(report.checks.map((c) => c.name)).toContain('fork-event');
  });

  it('fails when the child genesis is forged in the fork event', async () => {
    const genesisP = genesisHead(machineIdBytes(P_ID));
    const pEntry = checkpointEntry(0, 100n, Uint8Array.of(1, 2, 3));
    const parentHead = computeEntryHash(genesisP, pEntry);
    const forgedGenesis = Uint8Array.from(Array.from({ length: 32 }, () => 7));
    const cEntry = checkpointEntry(0, 200n, Uint8Array.of(5, 6, 7));
    const childHeadAfter = computeEntryHash(forgedGenesis, cEntry);

    const objects: Record<string, Fields> = {
      [P_ID]: machineFields({
        provenance_head: Array.from(parentHead),
        checkpoint_count: '1',
        current_blob_id: '100',
        manifest_hash: [1, 2, 3],
      }),
      // child head matches the forged genesis so provenance-head passes, isolating fork-binding
      [C_ID]: machineFields({
        provenance_head: Array.from(childHeadAfter),
        checkpoint_count: '1',
        current_blob_id: '200',
        manifest_hash: [5, 6, 7],
        parent: P_ID,
      }),
    };
    const client = makeClient({
      objects,
      checkpoints: [
        checkpointJson(P_ID, 0, 100n, [1, 2, 3], genesisP, parentHead),
        checkpointJson(C_ID, 0, 200n, [5, 6, 7], forgedGenesis, childHeadAfter),
      ],
      forks: [
        {
          child_id: C_ID,
          parent_id: P_ID,
          parent_head: Array.from(parentHead),
          child_head: Array.from(forgedGenesis),
        },
      ],
    });
    const report = await verifyFromChain(client, PKG, C_ID);
    expect(report.ok).toBe(false);
    expect(report.checks.filter((c) => !c.passed).map((c) => c.name)).toContain('fork-binding');
  });

  it('throws for a non-existent Machine', async () => {
    const { client } = forkScenario();
    await expect(verifyFromChain(client, PKG, DECOY_ID)).rejects.toThrow();
  });
});

describe('reconstructAccessTimeline', () => {
  it('reconstructs the grant then revoke history from events alone', async () => {
    const { objects, checkpoints, granted, revoked } = interleavedScenario();
    const client = makeClient({ objects, checkpoints, granted, revoked });
    const timeline = await reconstructAccessTimeline(client, PKG, M_ID);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ kind: 'grant', grantee: BOB, rights: 2, expiryMs: 0n });
    expect(timeline[1]).toMatchObject({ kind: 'revoke', grantee: BOB });
  });

  it('is empty for a Machine that was never shared', async () => {
    const { client } = forkScenario();
    expect(await reconstructAccessTimeline(client, PKG, P_ID)).toEqual([]);
  });
});

describe('exportEvidence + anchorEvidence', () => {
  const meta = { network: 'testnet', exportedAtMs: 0 };

  it('a faithful evidence file anchors against the chain, lineage included', async () => {
    const { client } = forkScenario();
    const evidence = await exportEvidence(client, PKG, C_ID, meta);
    const checks = await anchorEvidence(client, evidence);
    expect(
      checks.every((c) => c.passed),
      JSON.stringify(checks),
    ).toBe(true);
    expect(checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['anchor-machine', 'anchor-provenance', 'anchor-lineage']),
    );
  });

  it('a forged parent attribution fails the lineage anchor (the verified-not-trusted property)', async () => {
    const { client } = forkScenario();
    const evidence = await exportEvidence(client, PKG, C_ID, meta);
    // The file claims C was forked from a different parent; the chain says otherwise.
    const forged = {
      ...evidence,
      fork: {
        ...(evidence.fork as NonNullable<typeof evidence.fork>),
        parentId: `0x${'ee'.repeat(32)}`,
      },
    };
    const checks = await anchorEvidence(client, forged);
    expect(checks.find((c) => c.name === 'anchor-lineage')?.passed).toBe(false);
  });
});

describe('retire (end-of-life) verification', () => {
  const R_ID = `0x${'44'.repeat(32)}`;

  // A machine with one checkpoint and then a retire marker. Retire advances the head but is not a
  // checkpoint, so the chain still replays to the on-chain head and the checkpoint count stays 1.
  function retiredScenario() {
    const genesis = genesisHead(machineIdBytes(R_ID));
    const c0 = checkpointEntry(0, 100n, Uint8Array.of(1, 2, 3));
    const h1 = computeEntryHash(genesis, c0);
    const r = accessEntry(EVENT_RETIRE, 1, 9);
    const h2 = computeEntryHash(h1, r);
    const objects: Record<string, Fields> = {
      [R_ID]: machineFields({
        current_blob_id: '100',
        manifest_hash: [1, 2, 3],
        provenance_head: Array.from(h2),
        checkpoint_count: '1',
        parent: null,
      }),
    };
    const checkpoints = [checkpointJson(R_ID, 0, 100n, [1, 2, 3], genesis, h1)];
    const retired = [accessJson(R_ID, '0xowner', 1, 9, h1, h2, 1001)];
    return makeClient({ objects, checkpoints, retired });
  }

  it('verifies a retired machine: the chain replays and the checkpoint count excludes retire', async () => {
    const client = retiredScenario();
    const report = await verifyFromChain(client, PKG, R_ID);
    expect(report.ok, JSON.stringify(report.checks)).toBe(true);
    expect(report.checks.find((c) => c.name === 'checkpoint-count')?.passed).toBe(true);
  });

  it('isRetired is true for a retired machine and false otherwise', async () => {
    expect(await isRetired(retiredScenario(), PKG, R_ID)).toBe(true);
    const { client } = forkScenario();
    expect(await isRetired(client, PKG, P_ID)).toBe(false);
  });

  it('a retired machine exports evidence that still verifies offline', async () => {
    const client = retiredScenario();
    const evidence = await exportEvidence(client, PKG, R_ID, {
      network: 'testnet',
      exportedAtMs: 0,
    });
    // The retire entry is captured in the offline-verifiable record alongside the checkpoint.
    expect(evidence.entries.some((e) => e.eventType === EVENT_RETIRE)).toBe(true);
    const anchors = await anchorEvidence(client, evidence);
    expect(
      anchors.every((c) => c.passed),
      JSON.stringify(anchors),
    ).toBe(true);
  });
});
