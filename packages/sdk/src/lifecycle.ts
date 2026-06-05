import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Transaction } from '@mysten/sui/transactions';
import { buildCreateMachine, buildFork, buildRetire } from '@reeg/chain';

export interface LifecycleClients {
  sui: SuiJsonRpcClient;
  signer: Signer;
}

export interface MachineResult {
  machineId: string;
  digest: string;
}

const MACHINE_TYPE_SUFFIX = '::machine::Machine';

// Execute a transaction that creates a Machine and return the new object id. The id comes from
// the transaction's own object changes, so it is read straight from the chain's effects.
async function executeForMachine(
  sui: SuiJsonRpcClient,
  signer: Signer,
  transaction: Transaction,
): Promise<MachineResult> {
  const res = await sui.signAndExecuteTransaction({
    transaction,
    signer,
    options: { showObjectChanges: true, showEffects: true },
  });
  await sui.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`transaction failed: ${JSON.stringify(res.effects?.status)}`);
  }
  const created = res.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType.endsWith(MACHINE_TYPE_SUFFIX),
  );
  if (created?.type !== 'created') {
    throw new Error('transaction did not create a Machine object');
  }
  return { machineId: created.objectId, digest: res.digest };
}

/** Create a Machine owned by the signer. `policyId` defaults to the package id. */
export async function createMachine(
  options: { packageId: string; policyId?: string },
  clients: LifecycleClients,
): Promise<MachineResult> {
  const tx = buildCreateMachine(options.packageId, options.policyId ?? options.packageId);
  return executeForMachine(clients.sui, clients.signer, tx);
}

/** Fork a Machine into a new child that records its parent. `policyId` defaults to the package id. */
export async function fork(
  options: { packageId: string; machineId: string; policyId?: string },
  clients: LifecycleClients,
): Promise<MachineResult> {
  const tx = buildFork(options.packageId, options.machineId, options.policyId ?? options.packageId);
  return executeForMachine(clients.sui, clients.signer, tx);
}

/** Retire a Machine: append a permanent end-of-life marker to its provenance chain. Owner only.
 *  The record stays verifiable; the operator may then let the Walrus storage window lapse. */
export async function retire(
  options: { packageId: string; machineId: string },
  clients: LifecycleClients,
): Promise<{ digest: string }> {
  const res = await clients.sui.signAndExecuteTransaction({
    transaction: buildRetire(options.packageId, options.machineId),
    signer: clients.signer,
    options: { showEffects: true },
  });
  await clients.sui.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`retire failed: ${JSON.stringify(res.effects?.status)}`);
  }
  return { digest: res.digest };
}
