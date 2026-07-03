import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Transaction } from '@mysten/sui/transactions';
import {
  buildSealApprove,
  buildSealApproveUntil,
  NotAnAccessPolicyError,
  readAccessPolicy,
  readMachine,
} from '@reeg/chain';
import { createSessionKey, type SealCrypto } from '@reeg/crypto';
import type { WalrusBlobStore } from '@reeg/storage';

export interface RestoreClients {
  sui: SuiJsonRpcClient;
  storage: WalrusBlobStore;
  crypto: SealCrypto;
  signer: Signer;
}

/**
 * Restore a Machine's latest checkpoint: read the pinned ciphertext from Walrus, decrypt it with
 * a Seal session the caller authorizes (a short-lived signed personal message plus the
 * seal_approve dry run), and return the plaintext bundle. The engine then unpacks the bundle
 * into a working directory. Works for the owner and for any grantee: it auto-detects a shareable
 * Machine (whose policy_id resolves to an AccessPolicy bound back to it) and authorizes through
 * the time-limited allowlist policy; a legacy owner-only Machine uses the Machine-id policy.
 * Reads only public data plus the caller's own decryption right; no Reeg backend.
 */
export async function restore(
  context: { machineId: string; packageId: string; sealPackageId?: string; ttlMin?: number },
  clients: RestoreClients,
): Promise<Uint8Array> {
  const machine = await readMachine(clients.sui, context.machineId);
  if (machine.currentBlobId === 0n) {
    throw new Error('this environment has no checkpoint to restore yet');
  }
  const ciphertext = await clients.storage.readByU256(machine.currentBlobId);

  // Seal namespaces the identity, the SessionKey, and the seal_approve dry run by the package's
  // ORIGINAL (first-published) id and rejects an upgraded id; a never-upgraded package is its own
  // first version. The seal_approve modules ship in the original publish, so the dry-run call
  // targets it directly.
  const sealPackageId = context.sealPackageId ?? context.packageId;

  // The seal_approve call is never executed; its bytes authorize decryption in a dry run.
  const approveTx = await buildApprove(clients.sui, sealPackageId, machine.id, machine.policyId);
  const approveTxBytes = await approveTx.build({ client: clients.sui, onlyTransactionKind: true });

  const sessionKey = await createSessionKey({
    suiClient: clients.sui,
    packageId: sealPackageId,
    signer: clients.signer,
    ttlMin: context.ttlMin,
  });

  return clients.crypto.decrypt({ ciphertext, sessionKey, approveTxBytes });
}

// Choose the right seal_approve call. A shareable Machine points its policy_id at an AccessPolicy
// bound back to it; restore goes through seal_approve_until, which authorizes the owner and any
// unexpired grantee. Anything else (a legacy owner-only Machine, or a policy that does not bind
// back) uses the owner-only seal_approve.
async function buildApprove(
  sui: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
  policyId: string,
): Promise<Transaction> {
  let policy: Awaited<ReturnType<typeof readAccessPolicy>>;
  try {
    policy = await readAccessPolicy(sui, policyId);
  } catch (err) {
    if (err instanceof NotAnAccessPolicyError) {
      // Definitively a legacy owner-only Machine: its policy_id is not an AccessPolicy.
      return buildSealApprove(packageId, machineId);
    }
    // A transient RPC failure: propagate so the caller retries, rather than silently
    // downgrading a shareable Machine to the owner-only path (which cannot decrypt it).
    throw err;
  }
  if (sameId(policy.machineId, machineId)) {
    return buildSealApproveUntil(packageId, policyId, machineId);
  }
  return buildSealApprove(packageId, machineId);
}

// Sui object ids compare canonically after dropping 0x and any leading-zero shortening.
function sameId(a: string, b: string): boolean {
  const norm = (id: string) =>
    (id.startsWith('0x') ? id.slice(2) : id).toLowerCase().padStart(64, '0');
  return norm(a) === norm(b);
}
