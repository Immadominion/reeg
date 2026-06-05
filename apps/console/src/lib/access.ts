import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { type Grant, readAccessPolicy, readMachine } from '@reeg/sdk';
import { sameAddress } from './format';

/** The current sharing state of an environment, read straight from Sui for display. */
export interface AccessView {
  policyId: string;
  owner: string;
  grants: Grant[];
}

/**
 * Read who currently has access to an environment: its shared AccessPolicy and grants. Returns
 * null for a legacy owner-only Machine (whose policy_id is not an AccessPolicy bound to it).
 * Reads only public Sui data, like the rest of the Console.
 */
export async function loadAccess(
  client: SuiJsonRpcClient,
  machineId: string,
): Promise<AccessView | null> {
  const machine = await readMachine(client, machineId);
  try {
    const policy = await readAccessPolicy(client, machine.policyId);
    if (!sameAddress(policy.machineId, machineId)) {
      return null;
    }
    return { policyId: machine.policyId, owner: policy.owner, grants: policy.grants };
  } catch {
    return null;
  }
}
