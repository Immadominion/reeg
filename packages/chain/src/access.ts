import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

/** One grantee's access on an AccessPolicy. `expiryMs` of 0n means no expiry. */
export interface Grant {
  grantee: string;
  /** Rights bitfield: bit 0 = view, bit 1 = restore. Both release the key on chain. */
  rights: number;
  expiryMs: bigint;
}

/**
 * A shared AccessPolicy read from chain, mirroring reeg::access::AccessPolicy. This is a display
 * read of who currently has access; verification never depends on it (the sharing history is
 * reconstructed from events, see @reeg/verify reconstructAccessTimeline).
 */
export interface AccessPolicy {
  id: string;
  /** The Machine this policy governs. */
  machineId: string;
  owner: string;
  version: bigint;
  grants: Grant[];
}

/** Parse the `content.fields` of an AccessPolicy object. Pure, so it is unit-testable. */
export function parseAccessPolicyFields(id: string, fields: Record<string, unknown>): AccessPolicy {
  return {
    id,
    machineId: asAddress(fields.machine_id, 'machine_id'),
    owner: asAddress(fields.owner, 'owner'),
    version: BigInt(asScalar(fields.version, 'version')),
    grants: parseGrants(fields.grants),
  };
}

/**
 * Thrown when an object exists but is definitively not an AccessPolicy. Distinct from a transient
 * RPC failure (which propagates), so a caller like restore can fall back to the owner-only path
 * on this signal alone and retry on everything else, rather than treating a flaky read as
 * "legacy owner-only" and decrypting under the wrong identity.
 */
export class NotAnAccessPolicyError extends Error {
  constructor(id: string) {
    super(`object ${id} is not an AccessPolicy`);
    this.name = 'NotAnAccessPolicyError';
  }
}

/** Read and parse an AccessPolicy object by id. Throws NotAnAccessPolicyError if the object is
 *  not an AccessPolicy; lets transport errors propagate. */
export async function readAccessPolicy(
  client: SuiJsonRpcClient,
  id: string,
): Promise<AccessPolicy> {
  const response = await client.getObject({ id, options: { showContent: true } });
  const content = response.data?.content;
  if (content?.dataType !== 'moveObject' || !content.type.endsWith('::access::AccessPolicy')) {
    throw new NotAnAccessPolicyError(id);
  }
  return parseAccessPolicyFields(id, content.fields as Record<string, unknown>);
}

function asAddress(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`AccessPolicy.${field} expected an address string, got ${typeof value}`);
  }
  return value;
}

function asScalar(value: unknown, field: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  throw new Error(`AccessPolicy.${field} expected a numeric scalar, got ${typeof value}`);
}

// A Move VecMap<address, Grant> comes back as { contents: [{ key, value: { rights, expiry_ms } }] },
// with each struct possibly wrapped in a `fields` object depending on the node. unwrap descends
// that wrapper so both encodings parse.
function parseGrants(value: unknown): Grant[] {
  const map = unwrap(value) as { contents?: unknown };
  const contents = Array.isArray(map?.contents) ? map.contents : [];
  return contents.map((item) => {
    const entry = unwrap(item) as { key?: unknown; value?: unknown };
    const grant = unwrap(entry.value) as { rights?: unknown; expiry_ms?: unknown };
    return {
      grantee: String(entry.key),
      rights: Number(grant.rights ?? 0),
      expiryMs: BigInt(String(grant.expiry_ms ?? '0')),
    };
  });
}

function unwrap(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && 'fields' in (value as Record<string, unknown>)) {
    return (value as { fields: Record<string, unknown> }).fields;
  }
  return (value as Record<string, unknown>) ?? {};
}
