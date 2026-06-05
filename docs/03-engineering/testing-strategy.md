# Testing Strategy

What we test, at what level, and why. The guiding question for every test: does this protect the claim that a run is owned, shareable, portable, and provable? Tests that do not map to a real failure mode are noise.

## Levels

### Unit

- Snapshot engine: manifest construction, content hashing, delta computation, and that the same input produces the same `manifest_hash` every time (reproducibility, NFR-8).
- Crypto adapter: encrypt then decrypt round-trips; ciphertext is never the plaintext; backup-key handling.
- Chain client: PTB construction for register-checkpoint + append-provenance + update-head; correct reads of the Machine object.
- Move package: Machine create/fork, provenance append, and `seal_approve` policy logic. These are security-critical and get the most thorough coverage.

### Integration

- Snapshot to storage to chain: checkpoint a Machine, confirm a Walrus `blob_id` is produced, confirm the Sui Machine object's `provenance_head` advances and pins the blob and `manifest_hash`.
- Access policy end to end: owner can decrypt; a non-owner cannot; a grantee can after grant and cannot after revoke (forward-looking revoke, see [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)).

### End to end (the thesis tests)

- Portability: create and run a Machine on host A, checkpoint, destroy host A, restore on host B, confirm the restored workdir matches the recorded hashes. This is C3.
- Offline verifiability: with the Reeg backend stopped, run the Console verify against Sui + Walrus and confirm pass on a good run and fail on a tampered one. This is C2 and is the single most important test in the suite.
- Tamper detection: mutate a stored blob or a provenance entry and confirm verification rejects it ([verification-flow.json](../02-architecture/diagrams/verification-flow.json)).

## Security testing

- The `seal_approve` policy is treated as attack surface: tests assert it aborts to deny by default, that it is side-effect free, and that revoked grants fail on the next approval.
- Negative tests are first-class: unauthorized decrypt must fail, forged provenance must fail verify, wrong-host restore without the on-chain record must fail.

## What we do not over-test

- We do not test scenarios that cannot occur given the system boundaries. Validation lives at the boundaries (chain reads, network, user input), and tests follow that boundary, not every internal call.
- We do not add tests to chase coverage numbers on code whose failure has no user-visible consequence.

## Demo rehearsal as a test

The acceptance demo in [requirements-analysis.md](../01-product/requirements-analysis.md) is run as a scripted end-to-end rehearsal before June 21. If the kill-restore-verify-with-backend-down sequence does not pass cleanly, nothing else ships first.

## Environments

- Tests run against Sui + Walrus + Seal testnet using the endpoints in `config/`. Mainnet runs reuse the same tests with mainnet config before the Aug 27 payout window.
- Move tests run in the Move test harness; TypeScript tests run in the package test runner. Cross-package flows live under `test/` (see [repo-structure.md](repo-structure.md)).
</content>
