/// Seal access policies for a Machine's checkpoints.
///
/// Every policy function: name starts with `seal_approve`, takes `id: vector<u8>` first, is a
/// non-public entry function, aborts to deny (a clean return approves), and is side-effect
/// free because it runs in dry-run on the key servers. These are security-critical; see
/// docs/02-architecture/security-and-threat-model.md. Scaffold of the sharing surface:
/// owner-only here; allowlist and time-lock variants land in build-roadmap phase I.
module reeg::policy;

use reeg::machine::{Self, Machine};

/// The decryption identity did not match this Machine, so a key derived for one Machine
/// cannot be replayed to authorize another.
const EIdentityMismatch: u64 = 0;
/// The caller is not the Machine owner.
const ENoAccess: u64 = 1;

/// Owner-only policy. Seal calls this in a dry run with the identity used at encryption time;
/// we require that identity to be this Machine's id and the caller to be its owner.
entry fun seal_approve(id: vector<u8>, machine: &Machine, ctx: &TxContext) {
    assert!(id == machine.id_bytes(), EIdentityMismatch);
    assert!(machine.owner() == ctx.sender(), ENoAccess);
}

// --- tests ---

#[test_only]
use sui::test_scenario as ts;

#[test_only]
const OWNER: address = @0xA11CE;
#[test_only]
const OUTSIDER: address = @0xB0B;
#[test_only]
const POLICY: address = @0x9011C7;

#[test]
fun owner_with_matching_identity_is_approved() {
    let mut scenario = ts::begin(OWNER);
    machine::create_owned_for_testing(object::id_from_address(POLICY), scenario.ctx());

    scenario.next_tx(OWNER);
    let m = ts::take_from_sender<Machine>(&scenario);
    // Clean return means approved; the test passes by not aborting.
    seal_approve(m.id_bytes(), &m, scenario.ctx());
    ts::return_to_sender(&scenario, m);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = ENoAccess)]
fun non_owner_is_denied() {
    let mut scenario = ts::begin(OWNER);
    machine::create_owned_for_testing(object::id_from_address(POLICY), scenario.ctx());

    scenario.next_tx(OUTSIDER);
    let m = ts::take_from_address<Machine>(&scenario, OWNER);
    // Identity matches, but the caller is not the owner.
    seal_approve(m.id_bytes(), &m, scenario.ctx());
    ts::return_to_address(OWNER, m);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = EIdentityMismatch)]
fun mismatched_identity_is_denied() {
    let mut scenario = ts::begin(OWNER);
    machine::create_owned_for_testing(object::id_from_address(POLICY), scenario.ctx());

    scenario.next_tx(OWNER);
    let m = ts::take_from_sender<Machine>(&scenario);
    // Owner caller, but an identity that is not this Machine's id.
    seal_approve(b"not-this-machine", &m, scenario.ctx());
    ts::return_to_sender(&scenario, m);
    scenario.end();
}
