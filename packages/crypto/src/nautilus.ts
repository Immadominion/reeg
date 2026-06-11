// @reeg/crypto/nautilus - client side of the optional Nautilus attestation tier.
//
// Builds the FROZEN signature preimage an AWS Nitro enclave signs to attest a checkpoint, and
// verifies that ed25519 signature locally. The same preimage is rebuilt byte-for-byte by
// `reeg::attestation::attestation_preimage` on chain and by `packages/verify`, so the enclave, the
// Move verifier, and the off-chain verifier all agree. A checkpoint's manifest hash is signed by an
// enclave whose measurements (PCRs) and signing key are pinned on chain in an `EnclaveConfig`.

import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { fromHex, normalizeSuiAddress } from '@mysten/sui/utils';

/** Domain separator for the attestation preimage. Frozen: must equal `reeg::attestation`'s
 *  `ATTEST_DOMAIN` byte for byte. */
export const ATTEST_DOMAIN = 'REEG_NAUTILUS_ATTEST_V1';

/** Canonical 32-byte object id bytes (matches `object::id_to_bytes` and `@reeg/crypto`'s identity
 *  helpers): normalize 0x-prefixes/zero-pad, then decode the 64 hex chars to 32 bytes. */
function canonicalIdBytes(id: string): Uint8Array {
  return fromHex(normalizeSuiAddress(id).slice(2));
}

/** Encode an ASCII string (the fixed domain separator) to bytes without depending on a TextEncoder
 *  lib type. Every ATTEST_DOMAIN char is ASCII, where the byte equals the char code. */
function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}

/** BCS encoding of a u64: 8 bytes, little-endian — matches Move's `bcs::to_bytes(&seq)`. */
function u64LE(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

/** The bytes an enclave signs to attest a checkpoint:
 *  `ATTEST_DOMAIN ++ machineId(32) ++ bcs(seq: u64 LE, 8) ++ manifestHash`. Must match
 *  `reeg::attestation::attestation_preimage` exactly, or on-chain verification will reject. */
export function attestationPreimage(
  machineId: string,
  seq: bigint,
  manifestHash: Uint8Array,
): Uint8Array {
  const parts = [asciiBytes(ATTEST_DOMAIN), canonicalIdBytes(machineId), u64LE(seq), manifestHash];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Verify a raw ed25519 signature by the enclave key over `preimage`. Returns false (never throws)
 *  on a malformed key or signature, so a verifier treats it as "not attested" rather than erroring.
 *  This is the same scheme as `sui::ed25519::ed25519_verify` on chain. */
export async function verifyAttestationSignature(
  enclavePubkey: Uint8Array,
  signature: Uint8Array,
  preimage: Uint8Array,
): Promise<boolean> {
  try {
    return await new Ed25519PublicKey(enclavePubkey).verify(preimage, signature);
  } catch {
    return false;
  }
}
