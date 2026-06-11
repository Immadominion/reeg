// @reeg/crypto - Seal adapter for Reeg.
//
// Encrypts a checkpoint client-side before it ever touches Walrus, and decrypts it when an
// on-chain seal_approve policy permits. The key servers never see plaintext. The SealClient
// is injected so the key-server set and threshold config live in the sdk/config layer.

import type { SealClient, SealCompatibleClient } from '@mysten/seal';
import { SessionKey } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';

/** The result of encrypting a checkpoint. The backup key can decrypt the object on its own,
 *  so it is a disaster-recovery secret: keep it off Walrus and out of the manifest. */
export interface EncryptedCheckpoint {
  ciphertext: Uint8Array;
  backupKey: Uint8Array;
}

export interface EncryptParams {
  /** The plaintext checkpoint bundle from the engine (see docs/03-engineering/manifest-spec.md). */
  data: Uint8Array;
  /** The Reeg Move package that defines the seal_approve policy. */
  packageId: string;
  /** The Machine object id. Used as the Seal identity so a key derived for one Machine cannot
   *  be replayed against another; this must equal what `seal_approve` compares against. */
  machineId: string;
  /** When set, encrypt under the shared AccessPolicy identity (policyId ++ machineId) so an
   *  allowlist grantee can decrypt the same ciphertext. Omit for a legacy owner-only checkpoint,
   *  which uses the Machine id alone as the identity. */
  policyId?: string;
  /** Threshold t of n key servers required to decrypt. */
  threshold: number;
}

export interface DecryptParams {
  ciphertext: Uint8Array;
  /** A session key the caller created and signed for this package. */
  sessionKey: SessionKey;
  /** The built bytes of a transaction that calls the matching seal_approve function. */
  approveTxBytes: Uint8Array;
}

export class SealCrypto {
  constructor(private readonly client: SealClient) {}

  /** Encrypt a checkpoint bundle. With a policyId, the identity is the shared AccessPolicy id
   *  followed by the Machine id, so the matching seal_approve_allowlist authorizes any grantee;
   *  without one, the identity is the Machine id alone, owner-only by policy. */
  async encrypt(params: EncryptParams): Promise<EncryptedCheckpoint> {
    const id = params.policyId
      ? toPolicyIdentity(params.policyId, params.machineId)
      : toIdentity(params.machineId);
    const { encryptedObject, key } = await this.client.encrypt({
      threshold: params.threshold,
      packageId: params.packageId,
      id,
      data: params.data,
    });
    return { ciphertext: encryptedObject, backupKey: key };
  }

  /** Decrypt a checkpoint. The session key and approve-transaction bytes are supplied by the
   *  caller (the verifier/restore path), so this adapter holds no signing authority. */
  async decrypt(params: DecryptParams): Promise<Uint8Array> {
    return this.client.decrypt({
      data: params.ciphertext,
      sessionKey: params.sessionKey,
      txBytes: params.approveTxBytes,
    });
  }
}

// Canonical 32-byte object id as hex without `0x`. normalizeSuiAddress 0x-prefixes and
// zero-pads to 32 bytes, so the Seal identity always equals the on-chain object id bytes
// (object::uid_to_bytes / id_to_bytes are canonical) no matter how the id was written. Without
// this, a short or odd-length id would seal under bytes the on-chain seal_approve can never
// match, permanently breaking decryption for the owner and every grantee.
function canonicalHex(id: string): string {
  return normalizeSuiAddress(id).slice(2);
}

/** Seal identity for a legacy owner-only checkpoint: the canonical Machine id bytes, matching
 *  `reeg::policy::seal_approve`'s `id == machine.id_bytes()` check. */
export function toIdentity(machineId: string): string {
  return canonicalHex(machineId);
}

/** The Seal identity for a shareable checkpoint: the AccessPolicy object id bytes followed by
 *  the Machine id bytes (each canonical 32 bytes), hex without `0x`. Matches
 *  `reeg::access::expected_identity` on chain and the `policyIdentity` bytes @reeg/chain passes
 *  to `seal_approve_allowlist`/`seal_approve_until`. */
export function toPolicyIdentity(policyId: string, machineId: string): string {
  return canonicalHex(policyId) + canonicalHex(machineId);
}

/**
 * Create and sign a Seal session key for decryption. The operator signs a short-lived personal
 * message authorizing this package; the key servers honor it when the seal_approve policy
 * passes. Nothing here exposes a private key; signing goes through the injected Signer.
 */
export async function createSessionKey(params: {
  suiClient: SuiJsonRpcClient;
  packageId: string;
  signer: Signer;
  ttlMin?: number;
}): Promise<SessionKey> {
  const sessionKey = await SessionKey.create({
    address: params.signer.toSuiAddress(),
    packageId: params.packageId,
    ttlMin: params.ttlMin ?? 10,
    suiClient: params.suiClient as unknown as SealCompatibleClient,
  });
  const { signature } = await params.signer.signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);
  return sessionKey;
}

// Re-export so callers that build session keys do not also need a direct @mysten/seal import.
export type { SessionKey, Signer };

// Optional Nautilus attestation tier: the frozen signature preimage + local ed25519 verification,
// kept byte-for-byte in step with reeg::attestation on chain.
export { ATTEST_DOMAIN, attestationPreimage, verifyAttestationSignature } from './nautilus';
