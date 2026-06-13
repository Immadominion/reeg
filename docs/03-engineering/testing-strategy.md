# Testing Strategy

What we test, at what level, and why. The guiding question for every test: does this protect the claim that a run is owned, shareable, portable, and provable? Tests that do not map to a real failure mode are noise. The four capabilities (own it, share it, move it, prove it) are also the test charter: every suite below defends one of those four pillars.

## Status at a glance

Reeg is **live on Sui mainnet**, and the full test matrix is green. Counts as of 2026-06-11:

| Suite | Result | Defends |
| --- | --- | --- |
| Move package (`move/`) | 40/40 | own, share, prove, attest |
| `@reeg/verify` (offline verifier) | 54/54 | prove |
| `@reeg/chain` (PTB / chain client) | 21/21 | own, share, move |
| `@reeg/crypto` (Seal preimage / round-trip) | 8/8 | share, prove |
| Engine — Firecracker microVM (KVM host) | 8/8 + sudo-gated jailer | move |
| Engine — OCI container (KVM host) | 3/3 | move |
| Engine — snapshot/runtime lib (KVM host) | 11/11 | move |

**CI is green on all 3 jobs:** TypeScript build/lint/test, Rust fmt/clippy/test, and Move build/test. The KVM-host engine suites (Firecracker, OCI, jailer) run on a real AWS KVM box — see [Environments](#environments).

## Levels

### Unit

- **Snapshot engine:** manifest construction, content hashing (content-addressed CAS keyed by BLAKE3), delta computation, and that the same input produces the same `manifest_hash` every time (reproducibility, NFR-8). A canonical umask is pinned so captured file modes do not leak the ambient login umask — this is what makes restores byte-identical across hosts *and* across runtime tiers.
- **Crypto adapter (`@reeg/crypto`, 8/8):** Seal encrypt-then-decrypt round-trips; ciphertext is never the plaintext; backup-key handling; and the **cross-language preimage vector** — the TS client computes the same frozen attestation preimage bytes as the Move `attestation` module, asserted against the shared vector so the two languages can never silently drift.
- **Chain client (`@reeg/chain`, 21/21):** PTB construction for register-checkpoint + append-provenance + update-head, grant/revoke, fork, and correct reads of the Machine object.
- **Move package (`move/`, 40/40):** Machine create/retire/fork, provenance append, `seal_approve` policy logic, and the `attestation` module (`register_enclave` / `register_attested_command`) — the latter exercised with a **real ed25519 vector** so the on-chain signature check is tested against known-good bytes, not a mock. These are security-critical and get the most thorough coverage.

### Integration

- **Snapshot to storage to chain:** checkpoint a Machine, confirm a Walrus `blob_id` is produced, confirm the Sui Machine object's `provenance_head` advances and pins the blob and `manifest_hash`.
- **Access policy end to end:** owner can decrypt; a non-owner cannot; a grantee can after grant and cannot after revoke (forward-looking revoke — revocation cannot un-see already-decrypted data; see [security-and-threat-model.md](../02-architecture/security-and-threat-model.md)). The Seal committee threshold `t-of-n` is fixed at encryption time (`reeg checkpoint --threshold t`), and tests cover that the grant/revoke entries land on the provenance chain as `GRANT`/`REVOKE`.

### End to end (the thesis tests)

- **Portability (MOVE, C3):** create and run a Machine on host A, checkpoint, destroy host A, restore on host B, confirm the restored workdir (plus optional agent memory dir — `memory_pointer` round-trips) matches the recorded hashes. Restore is proven byte-identical not only across hosts but across **runtime tiers** (Local, OCI, Firecracker), because all three share one `Runtime` trait and one capture+verify path.
- **Offline verifiability (PROVE, C4):** with the Reeg backend stopped, run `@reeg/verify` against public Sui + Walrus data alone and confirm pass on a good run and fail on a tampered one. This is one of the most important guarantees in the suite, and it is what `@reeg/verify`'s 54 tests defend.
- **Tamper detection:** mutate a stored blob or a provenance entry and confirm verification rejects it ([verification-flow.json](../02-architecture/diagrams/verification-flow.json)).

### Runtime-tier tests (KVM host)

All three runtime tiers share one capture+verify path; these suites prove that path holds under real isolation, on a real AWS KVM host.

- **Firecracker microVM (`firecracker_session`, 8/8):** KVM kernel-boundary isolation, per-session tmpfs `/work`, read-only rootfs, in-guest agent over vsock with a length-prefixed framed protocol. Plus a **sudo-gated jailer test** covering Phase M item #14: running the Firecracker VMM under the **jailer** (chroot + privileges dropped to an unprivileged uid/gid + cgroup v2).
- **OCI container (`oci_session`, 3/3):** `runc`, read-only rootfs, per-session tmpfs `/work`, network isolation proven by an *unreachable metadata service*.
- **Snapshot/runtime lib (`lib`, 11/11):** the shared capture/restore/verify core that every tier depends on.

Phase M microVM hardening is **19/19 complete**, verified on the real KVM host.

### Attestation tests (PROVE, optional tier)

The optional **Nautilus TEE attestation tier** proves *which code* produced a checkpoint, and is **live on testnet and mainnet**. It is strictly additive: a non-attested run is byte-identical to before, with zero changes to `machine.move`'s layout or provenance head.

- **Reproducible build:** the enclave is a tiny musl-static AWS Nitro image (~6.5MB `.eif`); two cache-cleared rebuilds produce **identical PCRs**. This reproducibility is itself the test that makes offline attestation verification meaningful.
- **On-chain (Move, part of the 40/40):** `register_enclave` verifies a Nitro document via `0x2::nitro_attestation` and pins PCRs + ed25519 key into a shared `EnclaveConfig`; `register_attested_command` cheaply ed25519-verifies each per-checkpoint signature and emits `CommandAttested` — tested against the real ed25519 vector above.
- **Offline verification (`@reeg/verify`, part of the 54/54):** confirms the per-checkpoint signature *and* that the pinned PCRs match the trusted reproducible build, and flags all-zero debug-mode PCRs. Live `EnclaveConfig`s verified offline **4/4 on both networks** this session.

The enclave *attests* results; it does **not** run the agent (the agent stays in the Firecracker VM, preserving portability and offline verify).

## Security testing

- The `seal_approve` policy is treated as attack surface: tests assert it aborts to deny by default, that it is side-effect free, and that revoked grants fail on the next approval.
- Negative tests are first-class: unauthorized decrypt must fail, forged provenance must fail verify, a forged or wrong-PCR attestation must fail `@reeg/verify`, and wrong-host restore without the on-chain record must fail.

## What we do not over-test

- We do not test scenarios that cannot occur given the system boundaries. The Rust engine and TS client meet at exactly **one artifact boundary** (a manifest + content-addressed files); the engine never imports a chain or storage client, so we test that boundary, not a cartesian product of internals.
- We do not add tests to chase coverage numbers on code whose failure has no user-visible consequence.

## Compliance angle

The provenance suite doubles as record-keeping evidence. Reeg is framed against the EU AI Act Art. 12 (record-keeping/logs): tamper-evident provenance with configurable Walrus retention (`--epochs`; ~6 months ≈ 13 testnet epochs), and `reeg evidence` / `reeg audit` export a portable evidence file an auditor keeps. The offline-verify tests are what make that evidence file trustworthy without trusting Reeg. (Positioning, not legal advice — claims kept honest.)

## Environments

- TypeScript and Move tests run against Sui + Walrus + Seal **testnet** using the endpoints in `config/`, and the same tests run against **mainnet** config (Reeg is live on mainnet — package `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`).
- The **engine runtime-tier suites** (Firecracker, OCI, jailer) require a Linux **KVM host** and are run on a real AWS KVM box; the **attestation host pieces** additionally require an AWS **Nitro** host. The Local tier and the full own/share/move/prove chain run anywhere.
- Move tests run in the Move test harness; TypeScript tests run in the package test runner; engine tests run via `cargo test` on the KVM host. Cross-package flows live under `test/` (see [repo-structure.md](repo-structure.md)).

### Honest constraint the tests reflect

The full **encrypted checkpoint → restore → verify** loop is proven on **testnet**. On **mainnet**, encryption + storage + anchor + offline verify all work and are tested; only **decrypt (restore)** waits on a working mainnet Seal key server (no free public Open-mode key server exists on mainnet yet — a provider-side gap, not Reeg's code). Our suite therefore exercises the full decrypt loop where it is currently possible (testnet) and the encrypt/anchor/verify loop everywhere — we do not mark a mainnet decrypt test as passing when the dependency it needs is not yet available.
