import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { describe, expect, it } from 'vitest';
import { NotAnAccessPolicyError, parseAccessPolicyFields, readAccessPolicy } from './access';

const POLICY = `0x${'a'.repeat(64)}`;
const MACHINE = `0x${'b'.repeat(64)}`;
const OWNER = `0x${'c'.repeat(64)}`;
const BOB = `0x${'d'.repeat(64)}`;

const PKG = `0x${'9'.repeat(64)}`;

// A getObject stub returning a fixed content payload (or a transport rejection).
function clientReturning(content: unknown): SuiJsonRpcClient {
  return {
    async getObject() {
      return { data: content === null ? null : { content } };
    },
  } as unknown as SuiJsonRpcClient;
}

const policyContent = {
  dataType: 'moveObject',
  type: `${PKG}::access::AccessPolicy`,
  fields: { machine_id: MACHINE, owner: OWNER, version: '1', grants: { contents: [] } },
};

describe('parseAccessPolicyFields', () => {
  it('parses a flattened VecMap of grants', () => {
    const policy = parseAccessPolicyFields(POLICY, {
      machine_id: MACHINE,
      owner: OWNER,
      version: '1',
      grants: {
        contents: [
          { key: OWNER, value: { rights: '3', expiry_ms: '0' } },
          { key: BOB, value: { rights: '1', expiry_ms: '1717000000000' } },
        ],
      },
    });
    expect(policy.machineId).toBe(MACHINE);
    expect(policy.owner).toBe(OWNER);
    expect(policy.version).toBe(1n);
    expect(policy.grants).toEqual([
      { grantee: OWNER, rights: 3, expiryMs: 0n },
      { grantee: BOB, rights: 1, expiryMs: 1717000000000n },
    ]);
  });

  it('parses the `fields`-wrapped struct encoding some nodes return', () => {
    const policy = parseAccessPolicyFields(POLICY, {
      machine_id: MACHINE,
      owner: OWNER,
      version: 1,
      grants: {
        fields: {
          contents: [{ fields: { key: BOB, value: { fields: { rights: '2', expiry_ms: '0' } } } }],
        },
      },
    });
    expect(policy.grants).toEqual([{ grantee: BOB, rights: 2, expiryMs: 0n }]);
  });

  it('treats an empty policy as no grants', () => {
    const policy = parseAccessPolicyFields(POLICY, {
      machine_id: MACHINE,
      owner: OWNER,
      version: '1',
      grants: { contents: [] },
    });
    expect(policy.grants).toEqual([]);
  });
});

describe('readAccessPolicy', () => {
  it('parses a genuine AccessPolicy object', async () => {
    const policy = await readAccessPolicy(clientReturning(policyContent), POLICY);
    expect(policy.machineId).toBe(MACHINE);
    expect(policy.owner).toBe(OWNER);
  });

  it('throws NotAnAccessPolicyError for a non-move object (a package id)', async () => {
    await expect(
      readAccessPolicy(clientReturning({ dataType: 'package' }), PKG),
    ).rejects.toBeInstanceOf(NotAnAccessPolicyError);
  });

  it('throws NotAnAccessPolicyError for a move object of a different type', async () => {
    const other = { dataType: 'moveObject', type: `${PKG}::machine::Machine`, fields: {} };
    await expect(readAccessPolicy(clientReturning(other), MACHINE)).rejects.toBeInstanceOf(
      NotAnAccessPolicyError,
    );
  });

  it('lets a transport error propagate (not a NotAnAccessPolicyError) so callers can retry', async () => {
    const flaky = {
      async getObject() {
        throw new Error('ECONNRESET');
      },
    } as unknown as SuiJsonRpcClient;
    await expect(readAccessPolicy(flaky, POLICY)).rejects.toThrow('ECONNRESET');
    await readAccessPolicy(flaky, POLICY).catch((e) => {
      expect(e).not.toBeInstanceOf(NotAnAccessPolicyError);
    });
  });
});
