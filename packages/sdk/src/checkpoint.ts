import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { addRegisterCheckpoint } from '@reeg/chain';
import type { SealCrypto } from '@reeg/crypto';
import type { WalrusBlobStore } from '@reeg/storage';

/**
 * The artifact the engine hands across the boundary for one checkpoint. `data` is the opaque,
 * content-addressed bundle (the manifest plus its referenced objects, per
 * docs/03-engineering/manifest-spec.md); the client never inspects it. `manifestHash` is the
 * BLAKE3 hash the engine computed, which the chain pins and the verifier recomputes.
 */
export interface CheckpointBundle {
  data: Uint8Array;
  manifestHash: Uint8Array;
}

export interface CheckpointContext {
  machineId: string;
  packageId: string;
  /** The Machine's shared AccessPolicy id. When set, the checkpoint is encrypted under the
   *  shareable identity (policyId ++ machineId) so grantees can decrypt; omit for owner-only. */
  policyId?: string;
  /** Seal threshold, t of n key servers. */
  threshold: number;
  /** Walrus epochs to keep the checkpoint paid for (retention and cost lever). */
  epochs: number;
  /** Provenance payload hash; defaults to the manifest hash when omitted. */
  payloadHash?: Uint8Array;
}

export interface CheckpointClients {
  crypto: SealCrypto;
  storage: WalrusBlobStore;
  sui: SuiJsonRpcClient;
  signer: Signer;
}

export interface CheckpointResult {
  blobId: string;
  blobIdU256: bigint;
  /** The anchoring transaction digest. */
  digest: string;
  /** Disaster-recovery key for the ciphertext. Store it safely, off Walrus and out of the manifest. */
  backupKey: Uint8Array;
}

/**
 * Checkpoint, end to end: encrypt the bundle client-side, store the ciphertext on Walrus, then
 * anchor the blob id and manifest hash on chain in one transaction that also advances the
 * provenance head. The order matters: nothing leaves the client unencrypted, and the chain
 * only ever sees a content hash, never plaintext.
 */
export async function checkpoint(
  bundle: CheckpointBundle,
  context: CheckpointContext,
  clients: CheckpointClients,
): Promise<CheckpointResult> {
  const { ciphertext, backupKey } = await clients.crypto.encrypt({
    data: bundle.data,
    packageId: context.packageId,
    machineId: context.machineId,
    policyId: context.policyId,
    threshold: context.threshold,
  });

  const stored = await clients.storage.store(ciphertext, {
    epochs: context.epochs,
    signer: clients.signer,
  });

  const tx = new Transaction();
  addRegisterCheckpoint(tx, {
    packageId: context.packageId,
    machineId: context.machineId,
    blobId: stored.blobIdU256,
    manifestHash: bundle.manifestHash,
    payloadHash: context.payloadHash ?? bundle.manifestHash,
  });

  const result = await clients.sui.signAndExecuteTransaction({
    transaction: tx,
    signer: clients.signer,
  });

  return {
    blobId: stored.blobId,
    blobIdU256: stored.blobIdU256,
    digest: result.digest,
    backupKey,
  };
}
