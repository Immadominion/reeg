/// On-chain verifier for Reeg's optional Nautilus attestation tier.
///
/// The enclave ATTESTS results; it does not run the agent. The agent keeps running in the
/// Firecracker microVM (which preserves portability and offline verification), while a tiny AWS
/// Nitro enclave signs a checkpoint's manifest hash with an ed25519 key whose authenticity is
/// rooted in a Nitro attestation document. This module verifies that document once on chain
/// (`register_enclave`) to pin the enclave's measurements (PCRs) and signing key into a shared
/// `EnclaveConfig`, then cheaply `ed25519`-verifies a per-checkpoint signature
/// (`register_attested_command`) over a FROZEN preimage that binds the signature to a specific
/// machine, sequence, and manifest hash.
///
/// This tier is strictly ADDITIVE. It never touches `machine.move`'s struct layout, provenance
/// head, or `compute_entry_hash`, so a non-attested run is byte-identical to one made without this
/// module ever existing. A verifier confirms an attestation offline from Sui alone: it matches the
/// `CommandAttested` event's (machine_id, seq, manifest_hash) against the Machine's
/// `CheckpointRegistered` event, rebuilds the preimage, and checks the signature against the
/// `EnclaveConfig`'s pinned key — whose PCRs it compares to those a reproducible enclave build is
/// known to produce. Security-critical; see docs/02-architecture/security-and-threat-model.md.
///
/// `EnclaveConfig` is immutable measurement data, so there is no `migrate`: a `VERSION` bump is
/// handled by re-registering the enclave (one attestation call), not by mutating a pinned config.
module reeg::attestation;

use std::bcs;
use sui::ed25519;
use sui::event;
use sui::nitro_attestation::{Self, NitroAttestationDocument};
use sui::vec_map::{Self, VecMap};

/// Bumped if the `EnclaveConfig` layout or the attestation preimage changes, so a config registered
/// by an older package version cannot be used against newer verification logic.
const VERSION: u64 = 1;

/// Domain separator for the per-checkpoint signature preimage. Frozen: the enclave, this module,
/// and the off-chain verifier (packages/verify) must build the identical preimage byte for byte.
const ATTEST_DOMAIN: vector<u8> = b"REEG_NAUTILUS_ATTEST_V1";

/// A raw ed25519 public key is exactly 32 bytes; reject anything else at registration.
const ED25519_PUBKEY_LEN: u64 = 32;

/// The attestation document carried no public key to bind the enclave's signing identity to.
const EMissingPublicKey: u64 = 0;
/// The enclave public key in the attestation was not a 32-byte raw ed25519 key.
const EBadPublicKey: u64 = 1;
/// The per-checkpoint signature did not verify against the registered enclave key over the
/// frozen preimage.
const EBadSignature: u64 = 2;
/// The `EnclaveConfig` was created by a different package version.
const EWrongVersion: u64 = 3;

/// A registered enclave identity, shared so any checkpoint (and any verifier) can reference it.
/// Created only by verifying a real Nitro attestation document on chain, so its PCRs and signing
/// key are vouched for by AWS's Nitro root of trust at registration time.
public struct EnclaveConfig has key {
    id: UID,
    version: u64,
    /// PCR index -> measurement bytes, copied from the verified attestation (PCR0 = enclave image,
    /// PCR1 = kernel, PCR2 = application). A verifier compares these against the PCRs a reproducible
    /// enclave build is known to produce.
    pcrs: VecMap<u8, vector<u8>>,
    /// The enclave's ed25519 signing public key (raw 32 bytes), taken from the attestation's
    /// `public_key` field — the enclave seeds it from the NSM and embeds it in the document.
    enclave_pubkey: vector<u8>,
    /// Who registered the enclave (for display/governance); not a trust anchor.
    registrar: address,
}

/// Emitted once per enclave registration so off-chain readers can index `EnclaveConfig`s.
public struct EnclaveRegistered has copy, drop {
    config_id: ID,
    enclave_pubkey: vector<u8>,
    registrar: address,
}

/// Emitted per attested checkpoint: a verifier replays this offline against the `EnclaveConfig`
/// (pubkey + PCRs) and the Machine's `CheckpointRegistered` event for the same
/// (machine_id, seq, manifest_hash). Carries no secret; the signature is already verified on chain.
public struct CommandAttested has copy, drop {
    config_id: ID,
    machine_id: ID,
    seq: u64,
    manifest_hash: vector<u8>,
    enclave_pubkey: vector<u8>,
}

/// Register an enclave by verifying its Nitro attestation document on chain. The PTB first calls
/// `0x2::nitro_attestation::load_nitro_attestation(bytes, clock)` (which aborts unless the document
/// is genuine and well-formed) and passes the result here; we copy the measured PCRs and the
/// embedded ed25519 public key into a shared `EnclaveConfig`. This is the one expensive call — made
/// once per enclave build, not per checkpoint.
public fun register_enclave(doc: NitroAttestationDocument, ctx: &mut TxContext) {
    let pubkey_opt = nitro_attestation::public_key(&doc);
    assert!(pubkey_opt.is_some(), EMissingPublicKey);
    let enclave_pubkey = *pubkey_opt.borrow();
    assert!(enclave_pubkey.length() == ED25519_PUBKEY_LEN, EBadPublicKey);

    let entries = nitro_attestation::pcrs(&doc);
    let mut pcrs = vec_map::empty<u8, vector<u8>>();
    let mut i = 0;
    let n = entries.length();
    while (i < n) {
        let entry = &entries[i];
        let index = nitro_attestation::index(entry);
        // The attestation may repeat indices; keep the first occurrence of each.
        if (!pcrs.contains(&index)) {
            pcrs.insert(index, *nitro_attestation::value(entry));
        };
        i = i + 1;
    };

    let config = EnclaveConfig {
        id: object::new(ctx),
        version: VERSION,
        pcrs,
        enclave_pubkey,
        registrar: ctx.sender(),
    };
    event::emit(EnclaveRegistered {
        config_id: object::id(&config),
        enclave_pubkey: config.enclave_pubkey,
        registrar: config.registrar,
    });
    transfer::share_object(config);
}

/// Cheaply record that a registered enclave signed a specific checkpoint. Verifies an ed25519
/// signature by the enclave key over the frozen preimage binding (machine_id, seq, manifest_hash),
/// then emits `CommandAttested`. Additive: it reads nothing from and writes nothing to the Machine,
/// so the provenance chain is untouched and a verifier can confirm it offline from Sui alone.
public fun register_attested_command(
    config: &EnclaveConfig,
    machine_id: ID,
    seq: u64,
    manifest_hash: vector<u8>,
    signature: vector<u8>,
) {
    assert!(config.version == VERSION, EWrongVersion);
    let preimage = attestation_preimage(machine_id, seq, &manifest_hash);
    assert!(
        ed25519::ed25519_verify(&signature, &config.enclave_pubkey, &preimage),
        EBadSignature,
    );
    event::emit(CommandAttested {
        config_id: object::id(config),
        machine_id,
        seq,
        manifest_hash,
        enclave_pubkey: config.enclave_pubkey,
    });
}

/// The frozen signature preimage: `ATTEST_DOMAIN ++ machine_id bytes (32) ++ bcs(seq) (u64 LE, 8) ++
/// manifest_hash bytes`. The enclave signs exactly this, and packages/verify rebuilds it identically.
fun attestation_preimage(machine_id: ID, seq: u64, manifest_hash: &vector<u8>): vector<u8> {
    let mut preimage = ATTEST_DOMAIN;
    preimage.append(object::id_to_bytes(&machine_id));
    preimage.append(bcs::to_bytes(&seq));
    preimage.append(*manifest_hash);
    preimage
}

// --- getters for off-chain readers and tests ---

public fun version(config: &EnclaveConfig): u64 { config.version }

public fun enclave_pubkey(config: &EnclaveConfig): vector<u8> { config.enclave_pubkey }

public fun registrar(config: &EnclaveConfig): address { config.registrar }

public fun has_pcr(config: &EnclaveConfig, index: u8): bool { config.pcrs.contains(&index) }

public fun pcr(config: &EnclaveConfig, index: u8): vector<u8> { *config.pcrs.get(&index) }

// --- tests ---

#[test_only]
use sui::test_scenario as ts;
#[test_only]
use std::unit_test;

#[test_only]
const REGISTRAR: address = @0xA11CE;
// Frozen test vector: an ed25519 keypair signing the preimage for machine @0x..ab, seq 7, and the
// 32-byte manifest below (the ASCII "reeg-nautilus-manifest-hash-0007"). Generated offline with
// node:crypto; the public key and signature are real, so this exercises the on-chain ed25519 path.
#[test_only]
const TEST_MACHINE: address = @0xab;
#[test_only]
const TEST_SEQ: u64 = 7;
#[test_only]
const TEST_MANIFEST: vector<u8> = x"726565672d6e617574696c75732d6d616e69666573742d686173682d30303037";
#[test_only]
const TEST_PUBKEY: vector<u8> = x"36ae6ba13e43892ec9c842c6ff252102825ba2ec1c94c980e1ae9b92a5385744";
#[test_only]
const TEST_SIG: vector<u8> =
    x"6725e3acaaa6fd6f12a94d18f5133e9a950fc12ab12fa8505d215328d922ea971e04f1a18dc5600b48fce78cca91e7b82c030cd6346e6981abd60e3c54203a08";

#[test_only]
/// Build an `EnclaveConfig` directly with a chosen pubkey + PCRs, bypassing the Nitro document
/// (which can only be produced by the framework's `load_nitro_attestation`). Lets tests exercise
/// the per-checkpoint verification path with a real ed25519 signature.
fun config_for_testing(pubkey: vector<u8>, version: u64, ctx: &mut TxContext): EnclaveConfig {
    let mut pcrs = vec_map::empty<u8, vector<u8>>();
    pcrs.insert(0, b"pcr0");
    pcrs.insert(1, b"pcr1");
    pcrs.insert(2, b"pcr2");
    EnclaveConfig {
        id: object::new(ctx),
        version,
        pcrs,
        enclave_pubkey: pubkey,
        registrar: ctx.sender(),
    }
}

#[test]
fun preimage_is_frozen_and_deterministic() {
    let machine_id = object::id_from_address(TEST_MACHINE);
    let a = attestation_preimage(machine_id, TEST_SEQ, &TEST_MANIFEST);
    let b = attestation_preimage(machine_id, TEST_SEQ, &TEST_MANIFEST);
    assert!(a == b, 0);
    // 23 (domain) + 32 (machine id) + 8 (u64 seq) + 32 (manifest) = 95 bytes.
    assert!(a.length() == 95, 1);
}

#[test]
fun valid_enclave_signature_is_attested() {
    let mut scenario = ts::begin(REGISTRAR);
    let config = config_for_testing(TEST_PUBKEY, VERSION, scenario.ctx());
    let machine_id = object::id_from_address(TEST_MACHINE);
    // A real ed25519 signature over the frozen preimage verifies: no abort means attested.
    register_attested_command(&config, machine_id, TEST_SEQ, TEST_MANIFEST, TEST_SIG);
    unit_test::destroy(config);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EBadSignature)]
fun tampered_signature_is_rejected() {
    let mut scenario = ts::begin(REGISTRAR);
    let config = config_for_testing(TEST_PUBKEY, VERSION, scenario.ctx());
    let machine_id = object::id_from_address(TEST_MACHINE);
    let mut sig = TEST_SIG;
    let b = sig[0];
    *(&mut sig[0]) = b ^ 1u8; // flip one bit: the signature no longer verifies
    register_attested_command(&config, machine_id, TEST_SEQ, TEST_MANIFEST, sig);
    unit_test::destroy(config);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EBadSignature)]
fun wrong_seq_is_rejected() {
    let mut scenario = ts::begin(REGISTRAR);
    let config = config_for_testing(TEST_PUBKEY, VERSION, scenario.ctx());
    let machine_id = object::id_from_address(TEST_MACHINE);
    // Same signature, different seq: the preimage changes, so verification fails.
    register_attested_command(&config, machine_id, TEST_SEQ + 1, TEST_MANIFEST, TEST_SIG);
    unit_test::destroy(config);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EWrongVersion)]
fun stale_version_config_is_rejected() {
    let mut scenario = ts::begin(REGISTRAR);
    let config = config_for_testing(TEST_PUBKEY, VERSION + 1, scenario.ctx());
    let machine_id = object::id_from_address(TEST_MACHINE);
    register_attested_command(&config, machine_id, TEST_SEQ, TEST_MANIFEST, TEST_SIG);
    unit_test::destroy(config);
    scenario.end();
}

#[test]
fun config_exposes_pcrs_and_key() {
    let mut scenario = ts::begin(REGISTRAR);
    let config = config_for_testing(TEST_PUBKEY, VERSION, scenario.ctx());
    assert!(config.version() == VERSION, 0);
    assert!(config.enclave_pubkey() == TEST_PUBKEY, 1);
    assert!(config.registrar() == REGISTRAR, 2);
    assert!(config.has_pcr(0), 3);
    assert!(config.pcr(1) == b"pcr1", 4);
    assert!(!config.has_pcr(9), 5);
    unit_test::destroy(config);
    scenario.end();
}
