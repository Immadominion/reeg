import { fromHex, toHex } from '@mysten/sui/utils';
import { describe, expect, it } from 'vitest';
import { attestationPreimage, verifyAttestationSignature } from './nautilus';

// Cross-language test vector: identical inputs to move/sources/attestation.move's tests. If the TS
// preimage and the Move preimage diverge by a single byte, on-chain ed25519 verification fails — so
// asserting both the exact preimage bytes AND a real enclave signature catches any drift between
// the client, the Move verifier, and (later) the enclave signer.
const MACHINE = '0xab';
const SEQ = 7n;
// ASCII bytes of 'reeg-nautilus-manifest-hash-0007' (avoids a TextEncoder/node-types dependency).
const MANIFEST = Uint8Array.from('reeg-nautilus-manifest-hash-0007', (c) => c.charCodeAt(0));
const EXPECTED_PREIMAGE_HEX =
  '524545475f4e415554494c55535f4154544553545f563100000000000000000000000000000000000000000000000000000000000000ab0700000000000000726565672d6e617574696c75732d6d616e69666573742d686173682d30303037';
const PUBKEY = fromHex('36ae6ba13e43892ec9c842c6ff252102825ba2ec1c94c980e1ae9b92a5385744');
const SIG = fromHex(
  '6725e3acaaa6fd6f12a94d18f5133e9a950fc12ab12fa8505d215328d922ea971e04f1a18dc5600b48fce78cca91e7b82c030cd6346e6981abd60e3c54203a08',
);

describe('nautilus attestation preimage', () => {
  it('matches the on-chain (Move) preimage byte for byte', () => {
    const preimage = attestationPreimage(MACHINE, SEQ, MANIFEST);
    expect(toHex(preimage)).toBe(EXPECTED_PREIMAGE_HEX);
    // 23 (domain) + 32 (machine id) + 8 (u64 seq) + 32 (manifest) = 95 bytes.
    expect(preimage.length).toBe(95);
  });

  it('verifies a real enclave ed25519 signature over the preimage', async () => {
    const preimage = attestationPreimage(MACHINE, SEQ, MANIFEST);
    expect(await verifyAttestationSignature(PUBKEY, SIG, preimage)).toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const preimage = attestationPreimage(MACHINE, SEQ, MANIFEST);
    const bad = Uint8Array.from(SIG);
    bad[0] = (bad[0] ?? 0) ^ 1;
    expect(await verifyAttestationSignature(PUBKEY, bad, preimage)).toBe(false);
  });

  it('rejects a different sequence (the preimage changes)', async () => {
    const preimage = attestationPreimage(MACHINE, SEQ + 1n, MANIFEST);
    expect(await verifyAttestationSignature(PUBKEY, SIG, preimage)).toBe(false);
  });
});
