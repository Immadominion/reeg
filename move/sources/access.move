/// Shared access policy for a Machine's encrypted checkpoints.
///
/// The Machine is an owned object, so a non-owner can never reference it as an input to the
/// dry run a Seal key server uses to evaluate seal_approve. Sharing therefore lives in this
/// SHARED AccessPolicy object, which any grantee can reference. A shareable Machine and its
/// policy are created together and bound to each other: the Machine's policy_id points at the
/// policy, and shareable checkpoints are encrypted under the Seal identity
/// policy_id_bytes ++ machine_id_bytes, so the policy object id namespaces the key (a key for
/// one policy cannot authorize another) and the machine id double-binds it to one Machine.
///
/// Every policy function: name starts with seal_approve, takes id: vector<u8> first, is a
/// non-public entry, aborts to deny, and is side-effect free because it runs in a key-server
/// dry run. Owner mutations append a GRANT or REVOKE entry to the Machine's provenance chain,
/// so the sharing history is reconstructable offline from chain events alone (NFR-1). These are
/// security-critical; see docs/02-architecture/security-and-threat-model.md.
module reeg::access;

use reeg::machine::{Self, Machine};
use std::bcs;
use sui::clock::Clock;
use sui::event;
use sui::hash;
use sui::vec_map::{Self, VecMap};

/// Bumped if the AccessPolicy layout or its checks change, so a policy created by an older
/// package version cannot be used against newer logic. Every entry that reads the policy checks
/// it (the versioned-shared-object pattern).
const VERSION: u64 = 1;

/// Rights bits. Both currently just release the decryption key; "viewer" versus "can restore" is
/// a client-side UX label (a viewer is not offered the restore flow), surfaced honestly, not a
/// cryptographic boundary, because any key holder can decrypt the same ciphertext.
const RIGHTS_VIEW: u8 = 1; // bit 0
const RIGHTS_RESTORE: u8 = 2; // bit 1

/// The caller is not the policy owner.
const ENotOwner: u64 = 0;
/// The decryption identity did not equal this policy's id bytes followed by its bound machine
/// id bytes: a key derived for one policy or Machine cannot authorize another.
const EIdentityMismatch: u64 = 1;
/// The caller holds no grant on this policy.
const ENoAccess: u64 = 2;
/// The caller's grant has expired.
const EExpired: u64 = 3;
/// The policy and the supplied Machine do not refer to each other.
const EPolicyMachineMismatch: u64 = 4;
/// The policy was created by a different package version.
const EWrongVersion: u64 = 5;
/// The owner cannot be revoked; it always holds the policy.
const ECannotRevokeOwner: u64 = 6;

/// One grantee's access. expiry_ms == 0 means no expiry; otherwise the grant is valid while the
/// Clock is strictly before expiry_ms.
public struct Grant has store, copy, drop {
    rights: u8,
    expiry_ms: u64,
}

/// A Machine's shared access policy. machine_id binds it to exactly one Machine; grants maps a
/// grantee address to its Grant; the owner is always present with full rights.
public struct AccessPolicy has key {
    id: UID,
    machine_id: ID,
    owner: address,
    version: u64,
    grants: VecMap<address, Grant>,
}

/// Emitted on grant. Carries the full provenance preimage fields (event_type GRANT is implied)
/// so the sharing timeline replays from events alone, plus the grantee/rights/expiry for display.
public struct AccessGranted has copy, drop {
    machine_id: ID,
    policy_id: ID,
    grantee: address,
    rights: u8,
    expiry_ms: u64,
    seq: u64,
    blob_id: u256,
    manifest_hash: vector<u8>,
    payload_hash: vector<u8>,
    prev_head: vector<u8>,
    new_head: vector<u8>,
    timestamp_ms: u64,
}

/// Emitted on revoke (event_type REVOKE is implied).
public struct AccessRevoked has copy, drop {
    machine_id: ID,
    policy_id: ID,
    grantee: address,
    seq: u64,
    blob_id: u256,
    manifest_hash: vector<u8>,
    payload_hash: vector<u8>,
    prev_head: vector<u8>,
    new_head: vector<u8>,
    timestamp_ms: u64,
}

/// Create a shareable Machine together with its shared AccessPolicy in one transaction, bound to
/// each other atomically. The policy's UID is minted first so its id can be the Machine's
/// policy_id; the Machine's id then binds the policy. The owner starts with a full-rights
/// self-grant, so the owner decrypts through the same path a grantee does.
entry fun create_shared_machine(ctx: &mut TxContext) {
    let (machine, policy) = new_machine_and_policy(ctx);
    let owner = machine.owner();
    transfer::share_object(policy);
    transfer::public_transfer(machine, owner);
}

fun new_machine_and_policy(ctx: &mut TxContext): (Machine, AccessPolicy) {
    let owner = ctx.sender();
    let policy_uid = object::new(ctx);
    let policy_id = object::uid_to_inner(&policy_uid);
    let machine = machine::create(policy_id, ctx); // machine.policy_id == this policy's id
    let machine_id = object::id(&machine);
    let mut grants = vec_map::empty<address, Grant>();
    grants.insert(owner, Grant { rights: RIGHTS_VIEW | RIGHTS_RESTORE, expiry_ms: 0 });
    let policy = AccessPolicy {
        id: policy_uid,
        machine_id,
        owner,
        version: VERSION,
        grants,
    };
    (machine, policy)
}

/// Owner-only: add or update a grantee's access, then append a GRANT entry to the Machine's
/// provenance chain. Re-granting an existing grantee overwrites their rights and expiry.
public fun grant(
    machine: &mut Machine,
    policy: &mut AccessPolicy,
    grantee: address,
    rights: u8,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert_owner_and_binding(machine, policy, ctx);

    if (policy.grants.contains(&grantee)) {
        let existing = policy.grants.get_mut(&grantee);
        existing.rights = rights;
        existing.expiry_ms = expiry_ms;
    } else {
        policy.grants.insert(grantee, Grant { rights, expiry_ms });
    };

    let payload_hash = access_payload_hash(grantee, rights, expiry_ms);
    let (seq, prev_head, new_head, timestamp_ms) = machine.register_grant(payload_hash, clock, ctx);
    event::emit(AccessGranted {
        machine_id: object::id(machine),
        policy_id: object::id(policy),
        grantee,
        rights,
        expiry_ms,
        seq,
        blob_id: 0,
        manifest_hash: b"",
        payload_hash,
        prev_head,
        new_head,
        timestamp_ms,
    });
}

/// Owner-only: remove a grantee (idempotent), then append a REVOKE entry. Revocation is
/// forward-looking only: it stops future approvals; it cannot un-see plaintext a grantee already
/// decrypted. The owner cannot be revoked.
public fun revoke(
    machine: &mut Machine,
    policy: &mut AccessPolicy,
    grantee: address,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert_owner_and_binding(machine, policy, ctx);
    assert!(grantee != policy.owner, ECannotRevokeOwner);

    if (policy.grants.contains(&grantee)) {
        policy.grants.remove(&grantee);
    };

    let payload_hash = access_payload_hash(grantee, 0, 0);
    let (seq, prev_head, new_head, timestamp_ms) = machine.register_revoke(payload_hash, clock, ctx);
    event::emit(AccessRevoked {
        machine_id: object::id(machine),
        policy_id: object::id(policy),
        grantee,
        seq,
        blob_id: 0,
        manifest_hash: b"",
        payload_hash,
        prev_head,
        new_head,
        timestamp_ms,
    });
}

/// Allowlist policy: the caller must hold any grant on this policy, and the decryption identity
/// must be exactly this policy's id bytes followed by its bound machine id bytes.
entry fun seal_approve_allowlist(id: vector<u8>, policy: &AccessPolicy, ctx: &TxContext) {
    assert!(policy.version == VERSION, EWrongVersion);
    assert!(id == expected_identity(policy), EIdentityMismatch);
    assert!(policy.grants.contains(&ctx.sender()), ENoAccess);
}

/// Time-limited policy: as allowlist, plus the caller's grant must be unexpired against the
/// Clock. expiry_ms == 0 means no expiry, so this variant also authorizes plain grants and is
/// the one a grantee restore uses by default.
entry fun seal_approve_until(
    id: vector<u8>,
    policy: &AccessPolicy,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(policy.version == VERSION, EWrongVersion);
    assert!(id == expected_identity(policy), EIdentityMismatch);
    assert!(policy.grants.contains(&ctx.sender()), ENoAccess);
    let g = policy.grants.get(&ctx.sender());
    assert!(g.expiry_ms == 0 || clock.timestamp_ms() < g.expiry_ms, EExpired);
}

// The Seal identity a shareable checkpoint is encrypted under: this policy's object id followed
// by its bound machine id. Reconstructed here so the on-chain check matches @reeg/crypto's
// toPolicyIdentity byte for byte.
fun expected_identity(policy: &AccessPolicy): vector<u8> {
    let mut bytes = object::uid_to_bytes(&policy.id);
    bytes.append(object::id_to_bytes(&policy.machine_id));
    bytes
}

// The provenance payload hash for a grant or revoke: blake2b256(bcs(grantee) ++ [rights] ++
// bcs(expiry_ms)). A revoke uses rights 0 and expiry 0. This binds the on-chain entry to who was
// granted what, so a verifier replaying the chain rehashes the same bytes the event carries.
fun access_payload_hash(grantee: address, rights: u8, expiry_ms: u64): vector<u8> {
    let mut preimage = bcs::to_bytes(&grantee);
    preimage.push_back(rights);
    preimage.append(bcs::to_bytes(&expiry_ms));
    hash::blake2b256(&preimage)
}

fun assert_owner_and_binding(machine: &Machine, policy: &AccessPolicy, ctx: &TxContext) {
    assert!(policy.version == VERSION, EWrongVersion);
    assert!(policy.owner == ctx.sender(), ENotOwner);
    assert!(policy.machine_id == object::id(machine), EPolicyMachineMismatch);
    assert!(machine.policy_id() == object::id(policy), EPolicyMachineMismatch);
}

// Getters for off-chain readers and tests.

public fun machine_id(self: &AccessPolicy): ID {
    self.machine_id
}

public fun policy_owner(self: &AccessPolicy): address {
    self.owner
}

public fun version(self: &AccessPolicy): u64 {
    self.version
}

public fun is_granted(self: &AccessPolicy, who: address): bool {
    self.grants.contains(&who)
}

public fun grantees(self: &AccessPolicy): vector<address> {
    self.grants.keys()
}

/// Migrate a policy created by an older package version up to VERSION. Owner only, and forward
/// only. The versioned-shared-object pattern pairs the version guard on every entry (which aborts
/// EWrongVersion on a stale policy) with this migration, so a future VERSION bump does not lock
/// existing policies out of decrypt, grant, and revoke. With VERSION at 1 it is not yet
/// reachable, but it ships from day one so upgrades stay safe.
public fun migrate(policy: &mut AccessPolicy, ctx: &TxContext) {
    assert!(policy.owner == ctx.sender(), ENotOwner);
    assert!(policy.version < VERSION, EWrongVersion);
    policy.version = VERSION;
}

// --- tests ---

#[test_only]
use sui::test_scenario as ts;
#[test_only]
use sui::clock;
#[test_only]
use std::unit_test;

#[test_only]
const OWNER: address = @0xA11CE;
#[test_only]
const ALICE: address = @0xA11A5;
#[test_only]
const BOB: address = @0xB0B;

#[test_only]
public fun create_for_testing(ctx: &mut TxContext): (Machine, AccessPolicy) {
    new_machine_and_policy(ctx)
}

#[test]
fun owner_is_self_granted_and_approved() {
    let mut scenario = ts::begin(OWNER);
    let (machine, policy) = create_for_testing(scenario.ctx());

    seal_approve_allowlist(expected_identity(&policy), &policy, scenario.ctx());

    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
fun granted_address_is_approved() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());

    grant(&mut machine, &mut policy, BOB, RIGHTS_VIEW, 0, &clock, scenario.ctx());

    scenario.next_tx(BOB);
    seal_approve_allowlist(expected_identity(&policy), &policy, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENoAccess)]
fun non_granted_address_is_denied() {
    let mut scenario = ts::begin(OWNER);
    let (machine, policy) = create_for_testing(scenario.ctx());

    scenario.next_tx(BOB);
    seal_approve_allowlist(expected_identity(&policy), &policy, scenario.ctx());

    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENoAccess)]
fun revoke_is_forward_looking() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());

    grant(&mut machine, &mut policy, BOB, RIGHTS_RESTORE, 0, &clock, scenario.ctx());

    // BOB can decrypt after the grant.
    scenario.next_tx(BOB);
    seal_approve_allowlist(expected_identity(&policy), &policy, scenario.ctx());

    // Owner revokes. No Machine checkpoint state is touched by the revoke.
    scenario.next_tx(OWNER);
    let count_before = machine.checkpoint_count();
    revoke(&mut machine, &mut policy, BOB, &clock, scenario.ctx());
    assert!(machine.checkpoint_count() == count_before, 100);

    // BOB's next attempt is denied: revocation is forward-looking.
    scenario.next_tx(BOB);
    seal_approve_allowlist(expected_identity(&policy), &policy, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
fun unexpired_grant_is_approved_until() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let mut clock = clock::create_for_testing(scenario.ctx());

    grant(&mut machine, &mut policy, BOB, RIGHTS_VIEW, 100, &clock, scenario.ctx());
    clock.set_for_testing(50);

    scenario.next_tx(BOB);
    seal_approve_until(expected_identity(&policy), &policy, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EExpired)]
fun expired_grant_is_denied_until() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let mut clock = clock::create_for_testing(scenario.ctx());

    grant(&mut machine, &mut policy, BOB, RIGHTS_VIEW, 100, &clock, scenario.ctx());
    clock.set_for_testing(100); // now == expiry, so strictly-before fails

    scenario.next_tx(BOB);
    seal_approve_until(expected_identity(&policy), &policy, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
fun no_expiry_passes_until_at_any_time() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let mut clock = clock::create_for_testing(scenario.ctx());

    grant(&mut machine, &mut policy, BOB, RIGHTS_VIEW, 0, &clock, scenario.ctx());
    clock.set_for_testing(1_000_000_000);

    scenario.next_tx(BOB);
    seal_approve_until(expected_identity(&policy), &policy, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EIdentityMismatch)]
fun wrong_policy_prefix_is_denied() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());
    grant(&mut machine, &mut policy, BOB, RIGHTS_VIEW, 0, &clock, scenario.ctx());

    scenario.next_tx(BOB);
    let mut id = expected_identity(&policy);
    let first = id[0];
    *(&mut id[0]) = first ^ 1u8; // corrupt the policy-id prefix; right length, wrong key namespace
    seal_approve_allowlist(id, &policy, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EIdentityMismatch)]
fun wrong_machine_suffix_is_denied() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());
    grant(&mut machine, &mut policy, BOB, RIGHTS_VIEW, 0, &clock, scenario.ctx());

    scenario.next_tx(BOB);
    let mut id = expected_identity(&policy);
    let last = id.length() - 1;
    let b = id[last];
    *(&mut id[last]) = b ^ 1u8; // right policy prefix, wrong machine-id suffix
    seal_approve_allowlist(id, &policy, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENotOwner)]
fun grant_by_non_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());

    scenario.next_tx(BOB);
    grant(&mut machine, &mut policy, ALICE, RIGHTS_VIEW, 0, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ECannotRevokeOwner)]
fun revoking_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine, mut policy) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());

    revoke(&mut machine, &mut policy, OWNER, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENotOwner)]
fun migrate_by_non_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    let (machine, mut policy) = create_for_testing(scenario.ctx());

    scenario.next_tx(BOB);
    migrate(&mut policy, scenario.ctx());

    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EWrongVersion)]
fun migrate_on_current_version_aborts() {
    let mut scenario = ts::begin(OWNER);
    let (machine, mut policy) = create_for_testing(scenario.ctx());

    // The policy is already at VERSION, so version < VERSION is false: nothing to migrate.
    migrate(&mut policy, scenario.ctx());

    unit_test::destroy(machine);
    unit_test::destroy(policy);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EPolicyMachineMismatch)]
fun grant_against_mismatched_machine_aborts() {
    let mut scenario = ts::begin(OWNER);
    let (mut machine_a, _policy_a) = create_for_testing(scenario.ctx());
    let (_machine_b, mut policy_b) = create_for_testing(scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());

    // policy_b is bound to machine_b, so granting with machine_a must abort.
    grant(&mut machine_a, &mut policy_b, BOB, RIGHTS_VIEW, 0, &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    unit_test::destroy(machine_a);
    unit_test::destroy(_policy_a);
    unit_test::destroy(_machine_b);
    unit_test::destroy(policy_b);
    scenario.end();
}
