# AWS Firecracker host runbook (phase M)

The Firecracker microVM tier (build-roadmap [phase M](build-roadmap.md#phase-m---production-isolation-tier-firecracker-microvm))
needs `/dev/kvm`, which an Apple-silicon Mac cannot provide (macOS uses Hypervisor.framework, not
KVM; the `firecracker.rs` / `oci.rs` / `guest_agent.rs` files are `#[cfg(target_os = "linux")]`-gated
and do not even compile on macOS). This runbook stands up the cheapest disciplined AWS host that gives
us Linux + KVM, turns it into a reproducible Firecracker + OCI test bench, and proves the merged tier
runs end to end. The same instance is launched with Nitro Enclaves enabled so it doubles as the
[phase N](build-roadmap.md#phase-n---verifiable-compute-nautilus-mainnet) (Nautilus) host later.

Three scripts do the work; everything here is re-runnable, not one-off:

| Script | Runs on | Does |
|--------|---------|------|
| [`scripts/aws-dev-host.sh`](../../scripts/aws-dev-host.sh) | your Mac | provision / verify / stop / start / terminate the EC2 host |
| [`scripts/aws-host-bootstrap.sh`](../../scripts/aws-host-bootstrap.sh) | the host | install toolchain (Rust+musl, firecracker, runc, e2fsprogs); print readiness |
| [`scripts/build-fc-guest.sh`](../../scripts/build-fc-guest.sh) | the host | build guest kernel + ext4 rootfs (with the in-guest agent) + OCI root; write `~/.reeg-fc.env` |

## Cost

`c8i.2xlarge` (8 vCPU / 16 GiB, nested-virt + enclaves) is **~$0.38/hr on-demand in us-east-1, billed
only while running**. The discipline that keeps it cheap:

- Do everything that can run on the Mac on the Mac (all TS/Move tests; the cross-platform unit forms
  of review defects #1/#6/#7/#19). Reserve the box for the KVM-gated work only.
- `stop` the instance the moment you're idle. Stopped = the 80 GB gp3 disk only (~$0.08/GB-month ≈
  **$6/month**), compute paused, artifacts kept so the next `start` is instant.
- `down` (terminate) only when fully done with phases M and N.

A focused setup-and-prove session is a few hours of run time: a couple of dollars. The
`aws budgets` alarm in step 1 is the hard backstop.

## Steps

### 0. Preconditions
- `aws configure` working on the Mac (`aws sts get-caller-identity` returns your account).
- `awscli` v2, `ssh`, `curl`, `rsync` on the Mac.

### 1. Cost guardrail (once)
Create a monthly budget with email alerts so a forgotten instance can't surprise-bill:
```sh
# console: Billing → Budgets → create a $20/month cost budget, alert at 80% and 100%.
# or CLI (fill in your account id + email), see scripts notes.
```

### 2. Provision + verify (Mac)
```sh
./scripts/aws-dev-host.sh up        # launch c8i.2xlarge (nested virt + enclaves), SG scoped to your IP
# add the printed `Host reeg-host` block to ~/.ssh/config
./scripts/aws-dev-host.sh verify    # expect KVM-OK and a working enclave hello-world
```
**Gate:** if `verify` does not print **KVM-OK**, fix it before continuing. The Firecracker test's
`kvm_accessible()` opens `/dev/kvm` *read-write* and **skips silently** if it can't, which would look
like a false pass. Fix with `sudo setfacl -m u:$USER:rw /dev/kvm` (the bootstrap script also tries
this) or add the user to the `kvm` group and re-login.

### 3. Copy the repo + bootstrap the toolchain (Mac → host)
```sh
rsync -az --delete --exclude target --exclude node_modules --exclude .git/objects \
  ./ reeg-host:reeg/
ssh reeg-host 'bash ~/reeg/scripts/aws-host-bootstrap.sh'
```
Ends with a readiness summary; every line should be OK / a version, none MISSING.

### 4. Build the guest artifacts (host)
```sh
ssh reeg-host 'cd ~/reeg && bash scripts/build-fc-guest.sh'
```
Produces `/var/lib/reeg/{vmlinux,rootfs.ext4}` and `/var/lib/reeg/rootfs/`, and writes
`~/.reeg-fc.env`. The guest kernel is a pinned Firecracker-CI `vmlinux` (vsock + ext4 + serial, no
multi-hour kernel compile); the rootfs is a minimal Alpine image assembled **rootless** via
`mke2fs -d`, carrying a static-musl `reeg-engine` at `/sbin/reeg-engine` and a `/sbin/init` that execs
`reeg-engine guest-agent --port 52` (Firecracker sets boot args `console=ttyS0 reboot=k panic=1
pci=off` with **no `init=`**, so the guest's default init must launch the agent).

### 5. Prove the merge runs (host): the success bar
```sh
ssh reeg-host 'source ~/.reeg-fc.env && cd ~/reeg/engine && \
  cargo test -p reeg-runtime --features firecracker --test firecracker_session -- --test-threads=1 && \
  cargo test -p reeg-runtime --features oci         --test oci_session         -- --test-threads=1'
```
Pass means: a checkpoint taken inside a microVM restores byte-identically, **and**
`firecracker_manifest_hash_matches_local_tier_for_same_content` holds: a microVM snapshot produces
the same `workdir_root_hash` as the local/OCI tiers. That is phase M's core contract: the new
isolation boundary changes nothing about the snapshot or verification path.

### 5b. Jailer (#14, defense in depth, host, root)

The VMM normally spawns directly. Setting `REEG_FC_JAILER=1` launches it under the Firecracker
`jailer` instead: a chroot under `/srv/jailer/firecracker/<id>/root`, dropped to an unprivileged
uid/gid (`nobody`/`kvm` by default; override `REEG_FC_JAILER_UID`/`_GID`/`_CHROOT`), in a cgroup v2.
The jailer must start as **root**, so the gated test runs the prebuilt binary under `sudo` (building
under `sudo` would leave root-owned files in `target/`):

```sh
ssh reeg-host 'source ~/.reeg-fc.env && cd ~/reeg/engine && \
  cargo test -p reeg-runtime --features firecracker --test firecracker_session --no-run && \
  BIN=$(ls -t target/debug/deps/firecracker_session-* | grep -vE "\.d$" | head -1) && \
  sudo env REEG_FC_JAILER=1 REEG_FC_KERNEL="$REEG_FC_KERNEL" REEG_FC_ROOTFS="$REEG_FC_ROOTFS" \
       FIRECRACKER_BIN="$FIRECRACKER_BIN" JAILER_BIN=/usr/local/bin/jailer \
       "$BIN" firecracker_jailed --test-threads=1 --nocapture'
```

Pass means a jailed microVM boots, execs over vsock, and its checkpoint restores byte-identically:
the jail changes the isolation boundary, not the snapshot/verify path. The engine hard-links the
kernel + rootfs into the chroot (same filesystem, world-readable) and removes the whole jail dir on
drop. The cgroup the jailer creates under `/sys/fs/cgroup` is not auto-removed (empty after the VM
exits; harmless). Without `REEG_FC_JAILER` the direct-spawn path is unchanged and the jailer test
skips.

### 6. Stop (Mac)
```sh
./scripts/aws-dev-host.sh stop      # pause compute billing; keep disk + artifacts
# ./scripts/aws-dev-host.sh start   # resume later (instant; artifacts intact)
# ./scripts/aws-dev-host.sh down     # terminate for good (zeroes compute + disk)
```

## Result (first run, 2026-06-10)

Stood up on `c8i.2xlarge` (us-east-1), guest kernel `vmlinux-6.1.141`, Alpine 3.21 rootfs, static-musl
`reeg-engine`. Both tiers pass on real KVM:

```text
firecracker_session: 2 passed
  firecracker_agent_session_checkpoints_and_restores_byte_identical ... ok
  firecracker_manifest_hash_matches_local_tier_for_same_content ... ok
oci_session: 2 passed
  oci_agent_session_checkpoints_and_restores_byte_identical ... ok
  oci_log_digest_matches_local_tier_for_same_commands ... ok
```

The microVM boots, the in-guest agent execs and streams `/work`, and a checkpoint restores byte
identically: Phase M *runs*. The cross-tier manifest-hash parity test initially *failed* and
surfaced a real determinism defect (the captured file mode leaked the ambient login umask, which
differs by host/user/tier: Amazon Linux's `ec2-user` uses `0002` -> mode 0664, the microVM init uses
`0022` -> 0644). Fixed by pinning a canonical umask (`0022`) before every agent command in all three
tiers, see `engine/crates/runtime/src/umask.rs`. The full engine suite (manifest
conformance, reproducibility, bundle determinism) still passes after the change.

Drive the host going forward as the `reeg-host` SSH alias (added to `~/.ssh/config`); `stop` it when
idle, `start` to resume (artifacts under `/var/lib/reeg` persist across stop/start).

## Troubleshooting

- **FC test "skips" instead of running**: `/dev/kvm` not readable+writable by the test user (see the
  step-2 gate), or `REEG_FC_KERNEL` / `REEG_FC_ROOTFS` not exported (`source ~/.reeg-fc.env`).
- **Guest panics / no agent**: watch `console=ttyS0` output. If init fails, the kernel may lack
  `CONFIG_BINFMT_SCRIPT` (shebang init); rebuild the rootfs with `/sbin/init` as a tiny static binary,
  or confirm the CI kernel channel. Vsock failures mean the kernel lacks virtio-vsock: use a
  different Firecracker-CI kernel channel (`FC_KERNEL_CHANNEL`).
- **musl-static build fails** (a crate needs a C lib that won't link static): `build-fc-guest.sh`
  falls back to a native glibc build automatically; then the Alpine (musl) rootfs won't run it. In
  that case build the rootfs from a glibc base (AL2023/Ubuntu minimal) instead of Alpine, or install
  `musl-gcc` and set `CC_x86_64_unknown_linux_musl=musl-gcc`.
- **OCI test "runc not functional"**: the rootfs is missing `sh`/coreutils, or namespace ops are
  blocked. The Alpine root from `build-fc-guest.sh` includes busybox; confirm `REEG_OCI_ROOTFS`
  points at `/var/lib/reeg/rootfs`.

## After this: hardening (separate effort)

Running ≠ safe for untrusted code. The phase-M hardening punch list (19 defects, now
resolved) addresses this. Some are verifiable on the Mac (the safe-extract helper #1, length-framing caps #6/#7/#19, the
unit traversal test); the rest (Drop reaping #2, partial-init RAII #3, OCI namespace/seccomp/cap
hardening #4, per-session read-only rootfs #5, jailer #14, vsock/HTTP robustness, the adversarial
regression suite #13) need this box. That is the next plan once the bench is green.
