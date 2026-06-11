import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';

// PTB builders for the optional Nautilus attestation tier (reeg::attestation). These are additive:
// they never touch a Machine's provenance chain. See move/sources/attestation.move.

/**
 * Register an enclave by verifying its Nitro attestation document on chain. One PTB, two calls:
 * `0x2::nitro_attestation::load_nitro_attestation` parses and verifies the document (aborting unless
 * it is genuine), and its result is passed straight into `reeg::attestation::register_enclave`,
 * which pins the measured PCRs + the embedded ed25519 key into a shared `EnclaveConfig`. The caller
 * reads the new `EnclaveConfig` id from the transaction's object changes. This is the one expensive
 * call — made once per enclave build, not per checkpoint.
 */
export function buildRegisterEnclave(
  packageId: string,
  attestationDocument: Uint8Array,
): Transaction {
  const tx = new Transaction();
  const doc = tx.moveCall({
    target: '0x2::nitro_attestation::load_nitro_attestation',
    arguments: [tx.pure.vector('u8', attestationDocument), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  tx.moveCall({
    target: `${packageId}::attestation::register_enclave`,
    arguments: [doc],
  });
  return tx;
}

/**
 * Record that a registered enclave signed a specific checkpoint. Cheaply ed25519-verifies the
 * signature over the frozen preimage (built by `@reeg/crypto`'s `attestationPreimage`) against the
 * `EnclaveConfig`'s pinned key and emits `CommandAttested`. `seq` is the checkpoint sequence and
 * `machineId` an object id passed as a pure `ID` (32-byte address), matching `buildCreateMachine`.
 */
export function buildRegisterAttestedCommand(
  packageId: string,
  enclaveConfigId: string,
  machineId: string,
  seq: bigint,
  manifestHash: Uint8Array,
  signature: Uint8Array,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::attestation::register_attested_command`,
    arguments: [
      tx.object(enclaveConfigId),
      tx.pure.address(machineId),
      tx.pure.u64(seq),
      tx.pure.vector('u8', manifestHash),
      tx.pure.vector('u8', signature),
    ],
  });
  return tx;
}
