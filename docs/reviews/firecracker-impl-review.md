# Review — Firecracker impl (PR #1, `14ae8c7`)

Reviewer pass on the merged Firecracker microVM + OCI/runc + in-guest agent runtime
(`engine/crates/runtime/src/{firecracker,oci}.rs`, `engine/crates/cli/src/guest_agent.rs`).
Adversarial multi-lens review; every finding below was independently re-verified against the code
(27 confirmed out of 31 raised). Date: 2026-06-09.

## Verdict

The two new tiers are **well-structured and the byte-identical capture contract is genuinely
preserved** — all tiers feed the same `reeg_snapshot::checkpoint` over a host-side path, and the FC
manifest-parity test confirms it. The architecture (one `Runtime` trait, Linux-gated tiers, shared
snapshot path) is right.

But the merge ships real defects clustered in two areas before it can safely isolate **untrusted**
code on a real host:

1. **Lifecycle / resource hygiene** — `FirecrackerRuntime` never actually kills or reaps its VM
   (`std::process::Child::drop` is a no-op), and partial-init failures leak orphaned VMs + run dirs.
2. **Host handling of the attacker-influenced `/work` tar** — the raw `tar -x` shell-out is
   symlink-traversal exploitable, can pipe-deadlock, and pre-allocates up to 4 GiB from an unchecked
   `u32` length that *also* silently truncates archives > 4 GiB.

Plus: the OCI spec is materially weaker than its own doc claims (shares host net/IPC/UTS, no seccomp,
no cap drop), and the FC rootfs is read-write and shared across sessions. None break the manifest
contract, but the critical tar issue defeats the very kernel boundary the FC tier exists to provide.

## Where each fix can be verified

- **Verifiable on the dev Mac now** (cross-platform logic, unit-testable): #1 (as a shared safe-extract
  helper), #6/#7/#19 (length-framing as pure functions with caps), the unit form of the traversal test.
- **Needs the Linux + KVM box** (the FC/OCI/guest-agent files are `#[cfg(target_os = "linux")]`-gated, so
  they don't even compile-check on macOS): everything else — Drop reaping, OCI/FC hardening, jailer,
  vsock/HTTP robustness, and the full end-to-end + adversarial regression suite.

## Prioritized punch list

| # | Sev | Title | File:lines | Fix (summary) | Effort |
|---|-----|-------|-----------|----------------|--------|
| 1 | 🔴 critical | Host `tar -x` of attacker-influenced `/work` allows symlink traversal escaping staging (host arbitrary-write) | firecracker.rs 443–474 (+238–258; guest 90–111) | Stop shelling to `tar -x`; extract in-process with the `tar` crate `Entry::unpack_in` (refuses path escapes + symlink-out), reuse `reeg_snapshot` `validate_name` invariant | medium |
| 2 | 🟠 high | FC never kills/reaps the VM on drop (`Child::drop` is a no-op) — orphaned live VMs + zombies | firecracker.rs 82, 200–209 | Store `process`+`run_dir`; in Drop: SendCtrlAltDel → `try_wait` ~1–2s → `kill()` → `wait()` → `remove_dir_all(run_dir)`. Fix the false comments | small |
| 3 | 🟠 high | Partial-init failure in `create()` leaks the spawned VM + run_dir (every early return drops a no-op `Child`) | firecracker.rs 112–197 | RAII guard (kill+wait+rm) disarmed only after the struct is constructed; or build struct right after spawn and configure via `&mut self` | medium |
| 4 | 🟠 high | OCI spec far weaker than its doc: no network/IPC/UTS ns, no seccomp, no cap drop, no masked paths (untrusted code shares host net incl. `169.254.169.254`) | oci.rs 1–4 vs 204–259 | Add network/ipc/uts (and cgroup) namespaces, a seccomp profile, explicit minimal caps, masked/readonly paths; fix the doc | medium |
| 5 | 🟠 high | FC rootfs is read-write and shared across all sessions — cross-tenant bleed + guest-agent tampering persists into the next session | firecracker.rs 152–165, 38–39 | Per-session ephemeral writable layer over a read-only base (overlay or reflink copy); `is_read_only:true` + `ro` boot arg | large |
| 6 | 🟠 high | `u32` length prefix silently truncates `/work`/output > 4 GiB → truncated/divergent snapshot | guest_agent.rs 85, 108 (+host) | u64 length prefix on both sides (lockstep), or `u32::try_from(..).map_err(..)` to refuse oversize | small |
| 7 | 🟡 medium | Host pre-allocates up to 4 GiB from an unbounded `u32` length before reading (OOM/DoS lever) | firecracker.rs 365–372, 396–405 | `MAX_FRAME` caps per message type, checked before allocating; ideally stream the tar to the extractor/temp file with a running cap | small |
| 8 | 🟡 medium | `unpack_tar` can pipe-deadlock (whole archive to stdin while stderr never drained); child unreaped on early exit | firecracker.rs 445–473 | Write stdin on a spawned thread while draining stdout/stderr; always `wait()`. Dissolved entirely by the #1 in-process-tar fix | small |
| 9 | 🟡 medium | `vsock_connect` handshake read has no timeout → `wait_for_agent` can block forever in one probe | firecracker.rs 314–343, 409–422 | Set read timeout inside `vsock_connect`; return retryable on WouldBlock/Timeout; bound handshake length | small |
| 10 | 🟡 medium | Single-threaded guest agent, no read timeout — one hung exec wedges the VM control plane | guest_agent.rs 34–61 | Per-connection read timeout (drop just that conn); optionally thread-per-connection | small |
| 11 | 🟡 medium | `fc_put` HTTP reader treats read errors/timeouts as clean EOF; lossy UTF-8 across 4 KiB boundaries | firecracker.rs 288–306 | Accumulate raw bytes; distinguish EOF vs timeout vs error; parse status code as a number; decode after full header block | small |
| 12 | 🟡 medium | FC exec-response decode swallows malformed fields (`unwrap_or(-1)`/`unwrap_or_default`) → silently-wrong provenance | firecracker.rs 230–234 | Strict typed `Deserialize` of the response; `hex::decode(..).map_err(..)?`; missing exit code = protocol error, not `-1` | small |
| 13 | 🟡 medium | Tier tests only cover happy-path exit 0; no FC log-digest parity test | tests/firecracker_session.rs, oci_session.rs | Add per-tier: non-zero exit, missing-program, large-output round-trip, and `firecracker_log_digest_matches_local_tier` | medium |
| 14 | 🟡 medium | FC VMM runs unjailed (`Command::new`, no chroot/cgroup/seccomp/uid-drop); boot args lack `ro`/pinned `init=` | firecracker.rs 112–122, 142–165 | Launch via Firecracker `jailer`; once rootfs is read-only add `ro` + minimal pinned `init=` | large |
| 15 | ⚪ low | `set_read/write_timeout` failures ignored with `.ok()` → timeouts nullified if they ever fail | firecracker.rs 281–282, 354–355, 385–386 | Propagate the error (`map_err(..)?`) and fail fast | small |
| 16 | ⚪ low | `checkpoint()` can leave staging half-populated if extraction fails mid-stream (non-atomic) | firecracker.rs 238–258 | Extract into a temp dir, rename into place on success, rm on error | small |
| 17 | ⚪ low | Concurrent sessions can collide: caller `staging`/`bundle` wiped by `remove_dir_all`; shared rootfs ext4 | firecracker.rs 88–101, oci.rs 73,120 | Uniquify `staging`/`bundle` from counter+pid; document single-session-per-path; per-session rootfs layer (#5) | medium |
| 18 | ⚪ low | Hardcoded 5s/10s boot timeouts too tight for cold/loaded hosts; poor error context | firecracker.rs 125–130, 187, 409–422 | Promote to `FirecrackerConfig` fields; include last vsock error + `firecracker.stderr` in the timeout message | small |
| 19 | ⚪ low | Guest agent allocates up to 4 GiB from host-supplied `u32` request length (guest has 512 MiB → OOM kill) | guest_agent.rs 49–53 | Cap `req_len` to a few KiB before allocating; pair with the read timeout (#10) | small |

## AWS / Linux-box test plan

Prep a KVM box (e.g. an AWS `*.metal` or any nested-virt instance):

1. `ls -l /dev/kvm`; ensure the test user can open it **read-write** (the FC test's `kvm_accessible()`
   opens it rw — otherwise the FC tests silently skip). Add the user to the `kvm` group.
2. Install Rust (edition 2024), `firecracker` (on PATH or `FIRECRACKER_BIN`), `runc`, GNU `tar`,
   `mke2fs`/`e2tools`.
3. `cargo build -p reeg-engine --release`; place the binary at `/sbin/reeg-engine` inside an ext4
   rootfs whose init runs `reeg-engine guest-agent --port 52`. Build a `vmlinux` with vsock + ext4 +
   serial console.
4. Export: `REEG_FC_KERNEL=/var/lib/reeg/vmlinux`, `REEG_FC_ROOTFS=/var/lib/reeg/rootfs.ext4`,
   `REEG_OCI_ROOTFS=/var/lib/reeg/rootfs` (extracted dir, e.g. Alpine).

Happy path (confirm the merge works at all):

5. `cargo test -p reeg-runtime --features firecracker --test firecracker_session -- --test-threads=1`
6. `cargo test -p reeg-runtime --features oci --test oci_session -- --test-threads=1`

Regression + adversarial (add per #13, then run): non-zero exit / missing program / large-output
round-trip / FC log-digest parity; **symlink-traversal** (craft a tar with `escape -> /tmp/x` +
`escape/pwned`, feed to the extractor, assert nothing written outside staging — fails on GNU tar
today, passes after #1); **Drop reaping** (capture the firecracker PID, drop the runtime, assert the
PID is gone and run_dir removed; use a guest that ignores Ctrl+Alt+Del to prove force-kill);
**partial-init leak** (force each early return, assert no orphaned PID/dir); **u32 truncation** (> 4 GiB
`/work`); **pipe-deadlock** (tar emitting > 64 KiB stderr, under `timeout`); **vsock hang / frame caps**
(stub proxy that never sends `OK`, oversized length prefix); **OCI namespace** (assert
`169.254.169.254` and host loopback unreachable, seccomp/caps enforced); **rootfs isolation** (tamper
in session A, assert not visible in session B); **concurrency** (two parallel sessions, independent
byte-identical restores, drop `--test-threads=1`).

The unit form of the traversal test, the truncation/cap logic, and the framing helpers are testable
on **any** platform; everything else requires the Linux + KVM box.

## Addendum — first run on KVM (2026-06-10): tiers run; one determinism defect found + fixed

The merge was stood up and run for the first time on a real KVM host (AWS `c8i.2xlarge`; see
[aws-firecracker-runbook.md](../03-engineering/aws-firecracker-runbook.md)). Both
`firecracker_session` happy-path tests and both `oci_session` tests pass: the microVM boots, the
in-guest agent execs and streams `/work`, and a checkpoint restores byte-identically. So the merge
**runs** and the byte-identical capture contract holds within a tier.

But the cross-tier parity test (`firecracker_manifest_hash_matches_local_tier_for_same_content`)
**failed on first run**, surfacing a defect not in the original 19:

**#20 (🟠 high) — `workdir_root_hash` leaks the ambient login umask, so the same content yields
different manifests across tiers and hosts.**

- *Root cause:* the snapshot tree commits to each file's mode (`reeg_snapshot::tree`), and the mode of
  an agent-created file is set by the creating process's umask, which varies by environment: Amazon
  Linux `ec2-user` = `0002` (mode 0664), microVM init = `0022` (mode 0644). Identical
  `printf > file.txt` therefore hashed differently on the local tier vs the microVM.
- *Fix:* pin a canonical umask (`0022`) before every agent command in all three tiers — new
  `engine/crates/runtime/src/umask.rs` (`CANONICAL_UMASK` + `apply_canonical_umask`), applied via
  `Command::pre_exec` in the local (`process.rs`) and OCI (`oci.rs`) tiers and at guest-agent startup
  (`guest_agent.rs`). An explicit `chmod` is still honored; only the ambient-umask leak is removed.

This matters beyond Phase M: it threatened the cross-host **portability** (C3) and **provability**
(C4) guarantees — a verifier re-capturing on a host with a different login umask would have computed a
different `workdir_root_hash`. After the fix, both tiers produce identical `workdir_root_hash` for the
same content, and the full engine suite (manifest conformance, reproducibility, bundle determinism)
still passes.

## Addendum 2 — hardening pass applied + adversarially re-reviewed (2026-06-10)

The punch list was implemented, verified on the AWS KVM host, then the *applied diff* was put through a
second adversarial review (security + correctness + completeness lenses, each finding independently
re-verified). Closure status:

- **Closed (verified by a test):** #1 safe in-process tar extraction (reject symlink/hardlink/devices
  with per-component `validate_name`; unit tests for `..` traversal via a hand-rolled ustar and for
  symlink rejection) · #2 Drop reaping (leak test: zero orphaned `firecracker` processes after the
  suite) · #3 `VmGuard` RAII on every early return · #4 network/ipc/uts namespaces + all-caps-dropped +
  seccomp denylist + masked/readonly paths (KVM test: `169.254.169.254` unreachable; no-KVM spec guard
  asserts the denylist content) · #5 read-only rootfs + per-VM tmpfs `/work` (KVM tests: per-session
  isolation + write-outside-`/work`-fails) · #6 u64 framing host+guest · #7 frame caps before
  allocation (unit test) · #8 dissolved (no more `tar -x`) · #9 bounded vsock handshake with read
  timeout · #11 strict `fc_put` HTTP parsing · #12 strict exec-response decode · #13 FC-tier tests
  (non-zero exit, missing-program recovery, 4 MiB round-trip, log-digest parity) · #15 timeout errors
  propagated · #16 atomic staging (temp dir + rename) · #17 per-session uniquification (FC temp dir
  inside the unique `run_dir`; OCI bundle keyed by `container_id`) · #18 configurable boot timeouts with
  error context · #19 guest request cap (64 KiB before allocation).
- **Partially closed:** #10 — each connection now has a read timeout so one stalled request can't wedge
  the agent; thread-per-connection is deferred (single-threaded control plane retained).
- **Deferred (tracked, not forgotten):** #14 — the Firecracker VMM is still launched unjailed
  (`Command::new`, no `jailer`/chroot/seccomp/uid-drop). The microVM kernel boundary remains the primary
  defense; jailing it is operational hardening for a later pass.

The second review also caught and fixed gaps the first pass missed: the seccomp denylist omitted
`io_uring_*` and `userfaultfd` (capability-independent kernel-exploit surfaces) and `AF_NETLINK` sockets
— all now denied. **Final state:** lib unit 10/10, `firecracker_session` 8/8, `oci_session` 3/3 on real
KVM, clippy `-D warnings` clean, no leaked VMs. The tier is safe enough to isolate untrusted code at the
microVM boundary; #14 (jailer) is the remaining defense-in-depth item before high-assurance multi-tenant
production.
