/// Machine: an owned Sui object representing one agent environment, plus its hash-chained
/// provenance head. Owned by an address so it takes Sui's fast path. Field shapes match
/// docs/02-architecture/data-model.md. The object is mutated only through this package,
/// which is what keeps the provenance log append-only and tamper-evident.
///
/// Provenance integrity is enforced on chain: the new `provenance_head` is computed here
/// with `blake2b256` from the previous head and the event, so neither the operator nor Reeg
/// can submit a head that does not actually chain from prior entries (goal G3 in the threat
/// model). The verifier replays the same preimage off chain. The preimage is fixed:
///
///   entry_hash = blake2b256(
///       prev_head ++ [event_type] ++ bcs(seq) ++ bcs(blob_id)
///       ++ manifest_hash ++ payload_hash ++ bcs(timestamp_ms))
///
/// `manifest_hash` and `blob_id` are BLAKE3 content hashes computed off chain by the engine;
/// only the chaining hash is computed here, because Move offers blake2b256, not BLAKE3.
module reeg::machine;

use std::bcs;
use sui::clock::Clock;
use sui::event;
use sui::hash;

/// Only the Machine owner may register a checkpoint or fork.
const ENotOwner: u64 = 0;

/// Provenance event-type tags (data-model.md). CHECKPOINT and FORK are written by the core
/// lifecycle here; GRANT and REVOKE are written when reeg::access changes sharing; RETIRE marks a
/// Machine's permanent end of life. COMMAND stays reserved for a future per-command log. These
/// values are a frozen cross-language contract with the verifier (packages/verify provenance.ts);
/// existing values never change and new ones are only ever appended.
const EVENT_CHECKPOINT: u8 = 0;
#[allow(unused_const)]
const EVENT_COMMAND: u8 = 1;
const EVENT_GRANT: u8 = 2;
const EVENT_REVOKE: u8 = 3;
const EVENT_FORK: u8 = 4;
const EVENT_RETIRE: u8 = 5;

/// One agent environment.
public struct Machine has key, store {
    id: UID,
    owner: address,
    current_blob_id: u256,
    manifest_hash: vector<u8>,
    provenance_head: vector<u8>,
    checkpoint_count: u64,
    parent: std::option::Option<ID>,
    policy_id: ID,
    created_at_epoch: u32,
}

/// Emitted on creation. The indexer (phase H) rebuilds its read model from these events, so
/// nothing trusted depends on the indexer's own database.
public struct MachineCreated has copy, drop {
    machine_id: ID,
    owner: address,
    policy_id: ID,
    created_at_epoch: u32,
}

/// Emitted on each checkpoint. Carries the full provenance entry so the off-chain log is
/// reconstructable from chain events alone (NFR-9).
public struct CheckpointRegistered has copy, drop {
    machine_id: ID,
    seq: u64,
    blob_id: u256,
    manifest_hash: vector<u8>,
    payload_hash: vector<u8>,
    prev_head: vector<u8>,
    new_head: vector<u8>,
    timestamp_ms: u64,
}

/// Emitted on fork, recording provable lineage from parent to child. `parent_head` is the
/// parent's provenance head at fork time and `child_head` is the child's genesis head, so a
/// verifier can both recompute the fork binding and replay the child's own chain.
public struct MachineForked has copy, drop {
    child_id: ID,
    parent_id: ID,
    owner: address,
    blob_id: u256,
    parent_head: vector<u8>,
    child_head: vector<u8>,
}

/// Emitted on retire: a permanent, verifiable end-of-life marker. Carries the full provenance
/// preimage fields (event_type RETIRE is implied) so the conclusion replays offline like any other
/// entry, plus the owner who retired it. blob_id is 0 and manifest_hash is empty: retirement
/// advances the head only and is not a checkpoint.
public struct MachineRetired has copy, drop {
    machine_id: ID,
    owner: address,
    seq: u64,
    blob_id: u256,
    manifest_hash: vector<u8>,
    payload_hash: vector<u8>,
    prev_head: vector<u8>,
    new_head: vector<u8>,
    timestamp_ms: u64,
}

/// Create a Machine with an empty checkpoint history and return it, so a PTB can place it
/// wherever it wants (the composable pattern). The provenance head starts at a genesis bound
/// to the object id, so two Machines never share a chain.
public fun create(policy_id: ID, ctx: &mut TxContext): Machine {
    let uid = object::new(ctx);
    let genesis = hash::blake2b256(&object::uid_to_bytes(&uid));
    let owner = ctx.sender();
    let created_at_epoch = ctx.epoch() as u32;

    let machine = Machine {
        id: uid,
        owner,
        current_blob_id: 0,
        manifest_hash: vector[],
        provenance_head: genesis,
        checkpoint_count: 0,
        parent: std::option::none(),
        policy_id,
        created_at_epoch,
    };

    event::emit(MachineCreated {
        machine_id: object::id(&machine),
        owner,
        policy_id,
        created_at_epoch,
    });
    machine
}

/// Convenience entry point: create a Machine and keep it (transfer to the caller). PTBs that
/// compose further should call `create` and place the object themselves.
#[allow(lint(self_transfer))]
entry fun create_owned(policy_id: ID, ctx: &mut TxContext) {
    transfer::transfer(create(policy_id, ctx), ctx.sender());
}

/// Register a checkpoint: pin the latest ciphertext blob and manifest hash, and advance the
/// provenance head by one chained entry. Owner only.
public fun register_checkpoint(
    machine: &mut Machine,
    blob_id: u256,
    manifest_hash: vector<u8>,
    payload_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(machine.owner == ctx.sender(), ENotOwner);

    let seq = machine.checkpoint_count;
    let timestamp_ms = clock.timestamp_ms();
    let prev_head = machine.provenance_head;
    let new_head = compute_entry_hash(
        &prev_head,
        EVENT_CHECKPOINT,
        seq,
        blob_id,
        &manifest_hash,
        &payload_hash,
        timestamp_ms,
    );

    machine.current_blob_id = blob_id;
    machine.provenance_head = new_head;
    machine.manifest_hash = manifest_hash;
    machine.checkpoint_count = seq + 1;

    event::emit(CheckpointRegistered {
        machine_id: object::id(machine),
        seq,
        blob_id,
        manifest_hash: machine.manifest_hash,
        payload_hash,
        prev_head,
        new_head,
        timestamp_ms,
    });
}

/// Fork a Machine into a new owned object that records its parent. The child starts from the
/// parent's latest checkpoint state with a fresh provenance chain whose genesis is bound to
/// the parent head, so lineage is provable. Owner only for now; grantee forks arrive with
/// sharing in phase I. Returns the child object id.
public fun fork(parent: &Machine, policy_id: ID, ctx: &mut TxContext): Machine {
    assert!(parent.owner == ctx.sender(), ENotOwner);

    let uid = object::new(ctx);
    let parent_head = parent.provenance_head;
    let child_head = compute_fork_genesis(&parent_head, object::uid_to_bytes(&uid));

    let owner = ctx.sender();
    let parent_id = object::id(parent);
    let child = Machine {
        id: uid,
        owner,
        current_blob_id: parent.current_blob_id,
        manifest_hash: parent.manifest_hash,
        provenance_head: child_head,
        checkpoint_count: 0,
        parent: std::option::some(parent_id),
        policy_id,
        created_at_epoch: ctx.epoch() as u32,
    };

    event::emit(MachineForked {
        child_id: object::id(&child),
        parent_id,
        owner,
        blob_id: child.current_blob_id,
        parent_head,
        child_head,
    });
    child
}

/// Convenience entry point: fork and keep the child (transfer to the caller).
#[allow(lint(self_transfer))]
entry fun fork_owned(parent: &Machine, policy_id: ID, ctx: &mut TxContext) {
    transfer::transfer(fork(parent, policy_id, ctx), ctx.sender());
}

/// Append a sharing event to the provenance chain on behalf of reeg::access. A grant or revoke
/// is not a checkpoint, so this advances the head ONLY: current_blob_id, manifest_hash, and
/// checkpoint_count are deliberately left untouched, which keeps the verifier's checkpoint count
/// and its 0..n-1 sequence exactly as the checkpoints left them. The entry reuses the frozen
/// compute_entry_hash with seq = the current checkpoint_count (shared with the next checkpoint,
/// never consumed), blob_id = 0, and an empty manifest_hash. It returns the chain fields so the
/// caller emits a semantic event carrying the same bytes the verifier rehashes. Owner only;
/// callable only inside this package.
public(package) fun register_grant(
    machine: &mut Machine,
    payload_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
): (u64, vector<u8>, vector<u8>, u64) {
    append_head_entry(machine, EVENT_GRANT, payload_hash, clock, ctx)
}

public(package) fun register_revoke(
    machine: &mut Machine,
    payload_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
): (u64, vector<u8>, vector<u8>, u64) {
    append_head_entry(machine, EVENT_REVOKE, payload_hash, clock, ctx)
}

/// Retire a Machine: append a permanent, verifiable end-of-life entry to the provenance chain.
/// Like a sharing change this advances the head only, so the checkpoint history stays intact and
/// verifiable; it records the run's conclusion and anchors when retention may begin to lapse (the
/// operator may then stop paying for the Walrus blobs). Owner only. The Reeg client declines
/// further checkpoints on a retired Machine; on-chain hard-blocking would need a Machine schema
/// change and is deferred.
public fun retire(machine: &mut Machine, clock: &Clock, ctx: &TxContext) {
    let payload_hash = hash::blake2b256(&bcs::to_bytes(&machine.owner));
    let (seq, prev_head, new_head, timestamp_ms) =
        append_head_entry(machine, EVENT_RETIRE, payload_hash, clock, ctx);
    event::emit(MachineRetired {
        machine_id: object::id(machine),
        owner: machine.owner,
        seq,
        blob_id: 0,
        manifest_hash: b"",
        payload_hash,
        prev_head,
        new_head,
        timestamp_ms,
    });
}

/// Append a head-only provenance entry of a given type (grant, revoke, or retire): it advances
/// `provenance_head` and leaves current_blob_id, manifest_hash, and checkpoint_count untouched, so
/// the verifier's checkpoint count and its 0..n-1 sequence stay exactly as the checkpoints left
/// them. It reuses the frozen compute_entry_hash with seq = the current checkpoint_count (shared
/// with the next checkpoint, never consumed), blob_id = 0, and an empty manifest_hash, and returns
/// the chain fields so the caller emits a semantic event carrying the same bytes the verifier
/// rehashes. Owner only.
fun append_head_entry(
    machine: &mut Machine,
    event_type: u8,
    payload_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
): (u64, vector<u8>, vector<u8>, u64) {
    assert!(machine.owner == ctx.sender(), ENotOwner);

    let seq = machine.checkpoint_count;
    let timestamp_ms = clock.timestamp_ms();
    let prev_head = machine.provenance_head;
    let empty = b"";
    let new_head = compute_entry_hash(
        &prev_head,
        event_type,
        seq,
        0,
        &empty,
        &payload_hash,
        timestamp_ms,
    );
    machine.provenance_head = new_head;
    (seq, prev_head, new_head, timestamp_ms)
}

/// Compute the next provenance head. The preimage order is the frozen contract the verifier
/// replays; changing it is an incompatible change.
fun compute_entry_hash(
    prev_head: &vector<u8>,
    event_type: u8,
    seq: u64,
    blob_id: u256,
    manifest_hash: &vector<u8>,
    payload_hash: &vector<u8>,
    timestamp_ms: u64,
): vector<u8> {
    let mut preimage = *prev_head;
    preimage.push_back(event_type);
    preimage.append(bcs::to_bytes(&seq));
    preimage.append(bcs::to_bytes(&blob_id));
    preimage.append(*manifest_hash);
    preimage.append(*payload_hash);
    preimage.append(bcs::to_bytes(&timestamp_ms));
    hash::blake2b256(&preimage)
}

/// Compute a forked child's genesis head: blake2b256(parent_head ++ [EVENT_FORK] ++
/// child_id_bytes). Factored out so the verifier's matching computation can be conformance
/// tested against it.
fun compute_fork_genesis(parent_head: &vector<u8>, child_id_bytes: vector<u8>): vector<u8> {
    let mut preimage = *parent_head;
    preimage.push_back(EVENT_FORK);
    preimage.append(child_id_bytes);
    hash::blake2b256(&preimage)
}

// Getters. Other modules (the seal_approve policy) and off-chain readers go through these
// rather than touching fields, so the struct stays the only place layout is defined.

public fun owner(self: &Machine): address {
    self.owner
}

public fun current_blob_id(self: &Machine): u256 {
    self.current_blob_id
}

public fun manifest_hash(self: &Machine): vector<u8> {
    self.manifest_hash
}

public fun provenance_head(self: &Machine): vector<u8> {
    self.provenance_head
}

public fun checkpoint_count(self: &Machine): u64 {
    self.checkpoint_count
}

public fun parent(self: &Machine): std::option::Option<ID> {
    self.parent
}

public fun policy_id(self: &Machine): ID {
    self.policy_id
}

public fun created_at_epoch(self: &Machine): u32 {
    self.created_at_epoch
}

/// The object id as bytes, used as the Seal identity so a key derived for one Machine cannot
/// authorize decryption against another.
public fun id_bytes(self: &Machine): vector<u8> {
    object::uid_to_bytes(&self.id)
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
const OUTSIDER: address = @0xB0B;
#[test_only]
const POLICY: address = @0x9011C7;

#[test]
fun create_makes_owned_machine_with_genesis_head() {
    let mut scenario = ts::begin(OWNER);
    let policy_id = object::id_from_address(POLICY);
    machine_create(&mut scenario, policy_id);

    scenario.next_tx(OWNER);
    let m = ts::take_from_sender<Machine>(&scenario);
    assert!(m.owner() == OWNER, 0);
    assert!(m.checkpoint_count() == 0, 1);
    assert!(m.current_blob_id() == 0, 2);
    assert!(m.parent().is_none(), 3);
    assert!(!m.provenance_head().is_empty(), 4);
    assert!(m.policy_id() == policy_id, 5);
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

#[test]
fun register_checkpoint_advances_head_and_pins_blob() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OWNER);
    let mut m = ts::take_from_sender<Machine>(&scenario);
    let clock = clock::create_for_testing(scenario.ctx());
    let genesis = m.provenance_head();

    m.register_checkpoint(123, b"manifest-hash", b"payload-hash", &clock, scenario.ctx());

    assert!(m.current_blob_id() == 123, 0);
    assert!(m.manifest_hash() == b"manifest-hash", 1);
    assert!(m.checkpoint_count() == 1, 2);
    assert!(m.provenance_head() != genesis, 3);

    clock::destroy_for_testing(clock);
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

#[test]
fun provenance_chains_across_checkpoints() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OWNER);
    let mut m = ts::take_from_sender<Machine>(&scenario);
    let clock = clock::create_for_testing(scenario.ctx());
    let genesis = m.provenance_head();

    m.register_checkpoint(1, b"m1", b"p1", &clock, scenario.ctx());
    let head1 = m.provenance_head();
    m.register_checkpoint(2, b"m2", b"p2", &clock, scenario.ctx());
    let head2 = m.provenance_head();

    assert!(head1 != genesis, 0);
    assert!(head2 != head1, 1);
    assert!(m.checkpoint_count() == 2, 2);

    clock::destroy_for_testing(clock);
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENotOwner)]
fun register_by_non_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OUTSIDER);
    let mut m = ts::take_from_address<Machine>(&scenario, OWNER);
    let clock = clock::create_for_testing(scenario.ctx());

    // Sender is OUTSIDER, not the owner: this aborts before any state changes.
    m.register_checkpoint(1, b"m", b"p", &clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    ts::return_to_address(OWNER, m);
    scenario.end();
}

#[test]
fun fork_records_parent_and_starts_fresh() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OWNER);
    let mut parent = ts::take_from_sender<Machine>(&scenario);
    let clock = clock::create_for_testing(scenario.ctx());
    parent.register_checkpoint(77, b"parent-manifest", b"p", &clock, scenario.ctx());
    let parent_id = object::id(&parent);

    // Use the composable `fork` so we hold the child directly and avoid an ambiguous
    // take-from-sender (the owner now holds both parent and child).
    let child = parent.fork(object::id_from_address(POLICY), scenario.ctx());
    assert!(child.owner() == OWNER, 0);
    assert!(child.checkpoint_count() == 0, 1);
    assert!(child.current_blob_id() == 77, 2);
    assert!(child.manifest_hash() == b"parent-manifest", 3);
    assert!(child.parent() == std::option::some(parent_id), 4);

    clock::destroy_for_testing(clock);
    unit_test::destroy(child);
    ts::return_to_sender(&scenario, parent);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENotOwner)]
fun fork_by_non_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OUTSIDER);
    let parent = ts::take_from_address<Machine>(&scenario, OWNER);
    fork_owned(&parent, object::id_from_address(POLICY), scenario.ctx());
    ts::return_to_address(OWNER, parent);
    scenario.end();
}

/// Layout-change guard: reads every field through its getter. Adding, removing, or renaming
/// a field breaks this test at compile time, forcing a deliberate decision (and, for an
/// incompatible change, a schema or package version bump) rather than a silent layout drift.
#[test]
fun machine_exposes_its_full_shape() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OWNER);
    let m = ts::take_from_sender<Machine>(&scenario);
    let _ = m.owner();
    let _ = m.current_blob_id();
    let _ = m.manifest_hash();
    let _ = m.provenance_head();
    let _ = m.checkpoint_count();
    let _ = m.parent();
    let _ = m.policy_id();
    let _ = m.created_at_epoch();
    let _ = m.id_bytes();
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

/// Cross-language conformance: the on-chain entry hash must equal the value the TypeScript
/// verifier computes for the same inputs (@reeg/verify provenance.conformance.test.ts). Both
/// sides pin the same vector, so if either blake2b256 or the BCS preimage drifts, one fails.
#[test]
fun entry_hash_matches_cross_language_vector() {
    let prev_head = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let manifest_hash = b"manifest";
    let payload_hash = b"payload";
    let head = compute_entry_hash(
        &prev_head,
        EVENT_CHECKPOINT,
        0,
        1,
        &manifest_hash,
        &payload_hash,
        0,
    );
    assert!(head == x"bb2d11a7d28d786b7ca7e4590553208612020e5b8ad123f597e0f753003c3e4c", 0);
}

/// Conformance: full-width BCS little-endian encoding of the max u64/u256 values must match
/// the TS verifier (provenance.conformance.test.ts), so the high bytes are exercised.
#[test]
fun entry_hash_max_values_matches_cross_language_vector() {
    let prev_head = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let manifest_hash = b"m";
    let payload_hash = b"p";
    let head = compute_entry_hash(
        &prev_head,
        EVENT_CHECKPOINT,
        18446744073709551615,
        115792089237316195423570985008687907853269984665640564039457584007913129639935,
        &manifest_hash,
        &payload_hash,
        18446744073709551615,
    );
    assert!(head == x"22a696d2fe777f14477218356cc23e438c8a37dad3e174e34242349c742e89aa", 0);
}

/// Conformance: the create() genesis head, blake2b256(id_bytes), must match the TS
/// genesisHead (provenance.conformance.test.ts).
#[test]
fun genesis_head_matches_cross_language_vector() {
    let id_bytes = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let head = hash::blake2b256(&id_bytes);
    assert!(head == x"cb2f5160fc1f7e05a55ef49d340b48da2e5a78099d53393351cd579dd42503d6", 0);
}

/// Conformance: the fork genesis binding must match the TS computeForkChildHead, so the
/// verifier can confirm a child's genesis derives from its parent's head.
#[test]
fun fork_genesis_matches_cross_language_vector() {
    let parent_head = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let child_id = x"202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f";
    let head = compute_fork_genesis(&parent_head, child_id);
    assert!(head == x"21f0a84638c2a3e48557c06cbe37505f2548410513851a1935fb1d1c574ff6d4", 0);
}

/// A sharing event advances the provenance head but is not a checkpoint: it must leave
/// checkpoint_count, current_blob_id, and manifest_hash untouched, and the next checkpoint must
/// still get seq == checkpoint_count. This is what keeps the verifier's checkpoint counting and
/// 0..n-1 contiguity intact once grant/revoke entries share the chain.
#[test]
fun access_event_advances_head_without_touching_checkpoint_state() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OWNER);
    let mut m = ts::take_from_sender<Machine>(&scenario);
    let clock = clock::create_for_testing(scenario.ctx());

    m.register_checkpoint(123, b"manifest", b"p", &clock, scenario.ctx());
    let head_after_checkpoint = m.provenance_head();

    let (seq, prev_head, new_head, _ts) = m.register_grant(b"payload", &clock, scenario.ctx());
    assert!(seq == 1, 0); // shares the next checkpoint's seq, never consumes it
    assert!(prev_head == head_after_checkpoint, 1);
    assert!(m.provenance_head() == new_head, 2);
    assert!(m.provenance_head() != head_after_checkpoint, 3);
    assert!(m.checkpoint_count() == 1, 4); // unchanged
    assert!(m.current_blob_id() == 123, 5); // unchanged
    assert!(m.manifest_hash() == b"manifest", 6); // unchanged

    m.register_checkpoint(456, b"manifest2", b"p2", &clock, scenario.ctx());
    assert!(m.checkpoint_count() == 2, 7); // next checkpoint still got seq == checkpoint_count

    clock::destroy_for_testing(clock);
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

/// Cross-language conformance for a GRANT entry (event_type 2, blob 0, empty manifest). The
/// same vector is pinned in packages/verify provenance.conformance.test.ts.
#[test]
fun grant_entry_hash_matches_cross_language_vector() {
    let prev_head = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let empty = b"";
    let payload = b"grant";
    let head = compute_entry_hash(&prev_head, EVENT_GRANT, 0, 0, &empty, &payload, 0);
    assert!(head == x"f68372b4bf4b919c8d5e1c4ce25d3c59dde097cd1af20ef46445092c9a7f23e0", 0);
}

/// Cross-language conformance for a REVOKE entry (event_type 3).
#[test]
fun revoke_entry_hash_matches_cross_language_vector() {
    let prev_head = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let empty = b"";
    let payload = b"revoke";
    let head = compute_entry_hash(&prev_head, EVENT_REVOKE, 0, 0, &empty, &payload, 0);
    assert!(head == x"d445029dd79d54c5d73265cc8671637f9054e6525e9cdb7cd81f003ee1fc4241", 0);
}

/// Cross-language conformance for a RETIRE entry (event_type 5).
#[test]
fun retire_entry_hash_matches_cross_language_vector() {
    let prev_head = x"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let empty = b"";
    let payload = b"retire";
    let head = compute_entry_hash(&prev_head, EVENT_RETIRE, 0, 0, &empty, &payload, 0);
    assert!(head == x"74889391f2f4aec2dc187296703dd2bd2d17a2e031418b86fe2616d97dc30291", 0);
}

/// Retire advances the head only and is not a checkpoint: checkpoint_count, current_blob_id, and
/// manifest_hash stay as the last checkpoint left them, so the run's verifiable history is intact.
#[test]
fun retire_advances_head_without_touching_checkpoint_state() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OWNER);
    let mut m = ts::take_from_sender<Machine>(&scenario);
    let clock = clock::create_for_testing(scenario.ctx());
    m.register_checkpoint(123, b"manifest", b"p", &clock, scenario.ctx());
    let head_after_checkpoint = m.provenance_head();

    m.retire(&clock, scenario.ctx());
    assert!(m.provenance_head() != head_after_checkpoint, 0); // a permanent marker was appended
    assert!(m.checkpoint_count() == 1, 1); // unchanged
    assert!(m.current_blob_id() == 123, 2); // unchanged
    assert!(m.manifest_hash() == b"manifest", 3); // unchanged

    clock::destroy_for_testing(clock);
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENotOwner)]
fun retire_by_non_owner_aborts() {
    let mut scenario = ts::begin(OWNER);
    machine_create(&mut scenario, object::id_from_address(POLICY));

    scenario.next_tx(OUTSIDER);
    let mut m = ts::take_from_address<Machine>(&scenario, OWNER);
    let clock = clock::create_for_testing(scenario.ctx());
    m.retire(&clock, scenario.ctx());

    clock::destroy_for_testing(clock);
    ts::return_to_address(OWNER, m);
    scenario.end();
}

#[test_only]
fun machine_create(scenario: &mut ts::Scenario, policy_id: ID) {
    create_owned(policy_id, scenario.ctx());
}

/// Test-only helper so sibling modules (the policy tests) can create an owned Machine without
/// reaching into the private entry wrapper.
#[test_only]
#[allow(lint(self_transfer))]
public fun create_owned_for_testing(policy_id: ID, ctx: &mut TxContext) {
    transfer::transfer(create(policy_id, ctx), ctx.sender());
}
