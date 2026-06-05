import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { fromHex } from '@mysten/sui/utils';

/**
 * A Machine object read from chain, mirroring the Move struct in move/sources/machine.move.
 * The verifier and Console read these fields; nothing here trusts a Reeg backend.
 */
export interface Machine {
  id: string;
  owner: string;
  /** Walrus blob id of the latest checkpoint ciphertext, as u256. */
  currentBlobId: bigint;
  /** BLAKE3 hash of the environment manifest in that checkpoint. */
  manifestHash: Uint8Array;
  /** Head of the hash-chained provenance log (blake2b256, advanced on chain). */
  provenanceHead: Uint8Array;
  checkpointCount: bigint;
  /** The Machine this was forked from, or null. */
  parent: string | null;
  policyId: string;
  createdAtEpoch: number;
}

/**
 * Parse the `content.fields` of a Machine object response into a typed Machine. Pure, so it
 * is unit-testable without a live client. Keys match the Move field names exactly.
 */
export function parseMachineFields(id: string, fields: Record<string, unknown>): Machine {
  return {
    id,
    owner: asAddress(fields.owner, 'owner'),
    currentBlobId: BigInt(asScalar(fields.current_blob_id, 'current_blob_id')),
    manifestHash: asBytes(fields.manifest_hash, 'manifest_hash'),
    provenanceHead: asBytes(fields.provenance_head, 'provenance_head'),
    checkpointCount: BigInt(asScalar(fields.checkpoint_count, 'checkpoint_count')),
    parent: parseOptionId(fields.parent),
    policyId: asAddress(fields.policy_id, 'policy_id'),
    createdAtEpoch: Number(asScalar(fields.created_at_epoch, 'created_at_epoch')),
  };
}

/** Read and parse a Machine object by id. */
export async function readMachine(client: SuiJsonRpcClient, id: string): Promise<Machine> {
  const response = await client.getObject({ id, options: { showContent: true } });
  const content = response.data?.content;
  if (content?.dataType !== 'moveObject') {
    throw new Error(`object ${id} is not a Machine move object`);
  }
  return parseMachineFields(id, content.fields as Record<string, unknown>);
}

function asAddress(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Machine.${field} expected an address string, got ${typeof value}`);
  }
  return value;
}

// u64/u256/u32 come back from JSON-RPC as strings (large) or numbers (small); normalize.
function asScalar(value: unknown, field: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  throw new Error(`Machine.${field} expected a numeric scalar, got ${typeof value}`);
}

// Move vector<u8> is returned as a byte array, or as a hex string on some nodes; accept both.
function asBytes(value: unknown, field: string): Uint8Array {
  if (Array.isArray(value)) {
    return Uint8Array.from(value as number[]);
  }
  if (typeof value === 'string') {
    return fromHex(value);
  }
  throw new Error(`Machine.${field} expected bytes, got ${typeof value}`);
}

// Move Option<ID> appears as null, a bare id string, or a struct { vec: [id] } depending on
// the node's encoding. Collapse all three to id-or-null.
function parseOptionId(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && 'vec' in (value as Record<string, unknown>)) {
    const vec = (value as { vec: unknown }).vec;
    if (Array.isArray(vec) && vec.length > 0 && typeof vec[0] === 'string') {
      return vec[0];
    }
    return null;
  }
  return null;
}
