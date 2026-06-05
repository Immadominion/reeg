import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Transaction } from '@mysten/sui/transactions';
import { buildCreateSharedMachine, buildGrant, buildRevoke } from '@reeg/chain';

/** Rights bits, matching reeg::access. Both release the decryption key on chain; the difference
 *  is a client-side UX label (a viewer is not offered the restore flow). */
export const RIGHTS_VIEW = 1;
export const RIGHTS_RESTORE = 2;

export interface SharingClients {
  sui: SuiJsonRpcClient;
  signer: Signer;
}

export interface ShareableMachineResult {
  machineId: string;
  policyId: string;
  digest: string;
}

const MACHINE_TYPE_SUFFIX = '::machine::Machine';
const POLICY_TYPE_SUFFIX = '::access::AccessPolicy';

/**
 * Create a shareable Machine and its shared AccessPolicy in one transaction, returning both ids.
 * The owner starts self-granted, so the owner restores through the same allowlist path a grantee
 * does. Checkpoints for this Machine must be taken with its policyId so they encrypt under the
 * shareable identity (see checkpoint).
 */
export async function createShareableMachine(
  options: { packageId: string },
  clients: SharingClients,
): Promise<ShareableMachineResult> {
  const res = await clients.sui.signAndExecuteTransaction({
    transaction: buildCreateSharedMachine(options.packageId),
    signer: clients.signer,
    options: { showObjectChanges: true, showEffects: true },
  });
  await clients.sui.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`transaction failed: ${JSON.stringify(res.effects?.status)}`);
  }
  return {
    machineId: findCreated(res.objectChanges, MACHINE_TYPE_SUFFIX),
    policyId: findCreated(res.objectChanges, POLICY_TYPE_SUFFIX),
    digest: res.digest,
  };
}

export interface GrantOptions {
  packageId: string;
  machineId: string;
  policyId: string;
  grantee: string;
  /** Rights bitfield; defaults to view + restore. */
  rights?: number;
  /** Expiry in ms since epoch; 0 (default) means no expiry. */
  expiryMs?: bigint;
}

/** Grant or update a grantee's access. Owner only (enforced on chain). */
export async function grant(
  options: GrantOptions,
  clients: SharingClients,
): Promise<{ digest: string }> {
  const tx = buildGrant(
    options.packageId,
    options.machineId,
    options.policyId,
    options.grantee,
    options.rights ?? RIGHTS_VIEW | RIGHTS_RESTORE,
    options.expiryMs ?? 0n,
  );
  return executeSimple(clients, tx);
}

export interface RevokeOptions {
  packageId: string;
  machineId: string;
  policyId: string;
  grantee: string;
}

/** Revoke a grantee's access. Forward-looking: it stops future decryption but cannot recall a
 *  key share the grantee already fetched. Owner only. */
export async function revoke(
  options: RevokeOptions,
  clients: SharingClients,
): Promise<{ digest: string }> {
  const tx = buildRevoke(options.packageId, options.machineId, options.policyId, options.grantee);
  return executeSimple(clients, tx);
}

function findCreated(
  changes: Awaited<ReturnType<SuiJsonRpcClient['signAndExecuteTransaction']>>['objectChanges'],
  suffix: string,
): string {
  const created = changes?.find((c) => c.type === 'created' && c.objectType.endsWith(suffix));
  if (created?.type !== 'created') {
    throw new Error(`transaction did not create an object of type ${suffix}`);
  }
  return created.objectId;
}

async function executeSimple(
  clients: SharingClients,
  transaction: Transaction,
): Promise<{ digest: string }> {
  const res = await clients.sui.signAndExecuteTransaction({
    transaction,
    signer: clients.signer,
    options: { showEffects: true },
  });
  await clients.sui.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`transaction failed: ${JSON.stringify(res.effects?.status)}`);
  }
  return { digest: res.digest };
}
