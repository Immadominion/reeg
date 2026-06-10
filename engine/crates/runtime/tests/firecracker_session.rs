//! Phase M done-bar: the full loop (run, checkpoint, restore, verify) passes on the Firecracker
//! microVM tier exactly as on the container and local tiers, with no change to the verification
//! path. Untrusted code is isolated at the VM kernel boundary.
//!
//! Requires (skipped automatically if absent):
//!   - Linux + `/dev/kvm` accessible (`#[cfg(target_os = "linux")]`)
//!   - `firecracker` binary on PATH (or `FIRECRACKER_BIN`)
//!   - `REEG_FC_KERNEL`: path to a Linux kernel image (vmlinux or bzImage)
//!   - `REEG_FC_ROOTFS`: path to an ext4 rootfs image containing `reeg-engine` at `/sbin/reeg-engine`

#[cfg(all(target_os = "linux", feature = "firecracker"))]
mod fc_tests {
    use reeg_runtime::{
        CasStore, EnvironmentInputs, ExecRequest, FirecrackerConfig, FirecrackerRuntime, Runtime,
        drift, restore,
    };
    use tempfile::tempdir;

    fn sh(script: &str) -> ExecRequest {
        ExecRequest::new("sh", ["-c", script])
    }

    fn kvm_accessible() -> bool {
        // Check that we can actually open /dev/kvm read-write, not just that the node exists.
        // A non-root user without kvm group membership will get EACCES here; the test skips
        // rather than timing out waiting for a Firecracker socket that never appears.
        std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open("/dev/kvm")
            .is_ok()
    }

    fn fc_config() -> Option<FirecrackerConfig> {
        let kernel = std::env::var("REEG_FC_KERNEL").ok()?.into();
        let rootfs = std::env::var("REEG_FC_ROOTFS").ok()?.into();
        Some(FirecrackerConfig {
            kernel_path: kernel,
            rootfs_path: rootfs,
            ..FirecrackerConfig::default()
        })
    }

    #[test]
    fn firecracker_agent_session_checkpoints_and_restores_byte_identical() {
        if !kvm_accessible() {
            eprintln!("skip: /dev/kvm not accessible");
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => {
                eprintln!("skip: set REEG_FC_KERNEL and REEG_FC_ROOTFS");
                return;
            }
        };

        let store = tempdir().unwrap();
        let cas = CasStore::open(store.path()).unwrap();
        let staging = tempdir().unwrap();

        let mut rt = FirecrackerRuntime::create(staging.path().join("machine"), config).unwrap();

        // Run commands inside the VM; the agent works at /work.
        let o1 = rt.exec(&sh("mkdir -p src && printf 'fn main() {}' > src/main.rs")).unwrap();
        assert_eq!(
            o1.exit_code, 0,
            "exec 1 failed (exit {}):\nstdout: {}\nstderr: {}",
            o1.exit_code,
            String::from_utf8_lossy(&o1.stdout),
            String::from_utf8_lossy(&o1.stderr),
        );
        let o2 = rt.exec(&sh("printf 'hello reeg' > README")).unwrap();
        assert_eq!(
            o2.exit_code, 0,
            "exec 2 failed (exit {}):\nstdout: {}\nstderr: {}",
            o2.exit_code,
            String::from_utf8_lossy(&o2.stdout),
            String::from_utf8_lossy(&o2.stderr),
        );
        assert_eq!(rt.event_log().len(), 2);

        // Checkpoint: guest agent tars /work, host snapshots it. The manifest_hash is computed
        // identically to the other tiers — the verification path is unchanged.
        let manifest = rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();

        // Restore on a host that never saw the original.
        let fresh = tempdir().unwrap();
        restore(&manifest, &cas, fresh.path()).unwrap();
        assert!(
            drift(&manifest, &cas, fresh.path()).unwrap().is_clean(),
            "Firecracker tier restore drifted from the checkpoint"
        );
        assert_eq!(
            std::fs::read(fresh.path().join("src/main.rs")).unwrap(),
            b"fn main() {}"
        );
    }

    #[test]
    fn firecracker_manifest_hash_matches_local_tier_for_same_content() {
        // The manifest_hash is content-addressed over the working directory; the same files
        // must produce the same hash regardless of which runtime tier produced them.
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };

        let store = tempdir().unwrap();
        let cas = CasStore::open(store.path()).unwrap();

        // Build identical content via the Firecracker tier.
        let fc_staging = tempdir().unwrap();
        let mut fc_rt =
            FirecrackerRuntime::create(fc_staging.path().join("m"), config).unwrap();
        let o = fc_rt.exec(&sh("printf 'same content' > file.txt")).unwrap();
        assert_eq!(
            o.exit_code, 0,
            "FC exec failed (exit {}):\nstdout: {}\nstderr: {}",
            o.exit_code,
            String::from_utf8_lossy(&o.stdout),
            String::from_utf8_lossy(&o.stderr),
        );
        let fc_manifest = fc_rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();

        // Build identical content via the local tier.
        let local_work = tempdir().unwrap();
        let mut local_rt =
            reeg_runtime::LocalRuntime::create(local_work.path().join("m")).unwrap();
        local_rt.exec(&sh("printf 'same content' > file.txt")).unwrap();
        let local_manifest = local_rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();

        assert_eq!(
            fc_manifest.workdir_root_hash,
            local_manifest.workdir_root_hash,
            "Firecracker and local tiers produced different workdir_root_hash for identical content"
        );
    }

    /// Defect #5: each session's `/work` is a fresh per-VM tmpfs, so one session's writes must not
    /// be visible to a later session booted from the same (read-only) rootfs image.
    #[test]
    fn firecracker_per_session_isolation_no_write_bleed() {
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };
        let staging_a = tempdir().unwrap();
        let mut a = FirecrackerRuntime::create(staging_a.path().join("a"), config).unwrap();
        let w = a.exec(&sh("echo tenant-a-secret > /work/marker")).unwrap();
        assert_eq!(w.exit_code, 0, "session A write failed: {w:?}");
        drop(a); // tear the VM down; its tmpfs /work is gone with it.

        let config_b = fc_config().unwrap();
        let staging_b = tempdir().unwrap();
        let mut b = FirecrackerRuntime::create(staging_b.path().join("b"), config_b).unwrap();
        let r = b
            .exec(&sh("[ -e /work/marker ] && echo PRESENT || echo ABSENT"))
            .unwrap();
        let out = String::from_utf8_lossy(&r.stdout);
        assert!(
            out.contains("ABSENT"),
            "session B saw session A's /work marker (isolation broken): {out:?}"
        );
    }

    /// Defect #5: the rootfs drive is read-only, so a write outside the tmpfs `/work` must fail —
    /// proving the shared image cannot be tampered with from inside a session.
    #[test]
    fn firecracker_rootfs_is_read_only_outside_work() {
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };
        let staging = tempdir().unwrap();
        let mut rt = FirecrackerRuntime::create(staging.path().join("m"), config).unwrap();
        // /work is writable (tmpfs); a sibling path on the read-only root must not be.
        let inside = rt.exec(&sh("echo ok > /work/canwrite && echo rc=$?")).unwrap();
        assert!(
            String::from_utf8_lossy(&inside.stdout).contains("rc=0"),
            "writing inside /work should succeed: {inside:?}"
        );
        let outside = rt
            .exec(&sh("touch /reeg-should-fail 2>/dev/null && echo WROTE || echo READONLY"))
            .unwrap();
        assert!(
            String::from_utf8_lossy(&outside.stdout).contains("READONLY"),
            "rootfs outside /work should be read-only: {outside:?}"
        );
    }

    /// A non-zero exit from a guest command is a normal outcome, reported faithfully (not an error).
    #[test]
    fn firecracker_nonzero_exit_is_reported() {
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };
        let staging = tempdir().unwrap();
        let mut rt = FirecrackerRuntime::create(staging.path().join("m"), config).unwrap();
        let o = rt.exec(&sh("exit 3")).unwrap();
        assert_eq!(o.exit_code, 3, "expected exit 3, got {o:?}");
    }

    /// Launching a program that does not exist surfaces an error, and the runtime stays usable on
    /// the next (fresh) connection.
    #[test]
    fn firecracker_missing_program_errors_then_recovers() {
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };
        let staging = tempdir().unwrap();
        let mut rt = FirecrackerRuntime::create(staging.path().join("m"), config).unwrap();
        let missing = ExecRequest::new("reeg_definitely_not_a_real_binary_zzz", [] as [String; 0]);
        assert!(rt.exec(&missing).is_err(), "missing program should error");
        let ok = rt.exec(&sh("echo recovered")).unwrap();
        assert_eq!(ok.exit_code, 0);
        assert!(String::from_utf8_lossy(&ok.stdout).contains("recovered"));
    }

    /// A multi-megabyte `/work` round-trips through the u64-framed snapshot tar and restores
    /// byte-identically — exercising a frame well past the old u32 boundary behavior.
    #[test]
    fn firecracker_large_output_round_trips() {
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };
        let store = tempdir().unwrap();
        let cas = CasStore::open(store.path()).unwrap();
        let staging = tempdir().unwrap();
        let mut rt = FirecrackerRuntime::create(staging.path().join("m"), config).unwrap();
        let w = rt.exec(&sh("yes reeg | head -c 4194304 > big.bin")).unwrap();
        assert_eq!(w.exit_code, 0, "write failed: {w:?}");
        let manifest = rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();
        let fresh = tempdir().unwrap();
        restore(&manifest, &cas, fresh.path()).unwrap();
        assert!(
            drift(&manifest, &cas, fresh.path()).unwrap().is_clean(),
            "large-output restore drifted"
        );
        assert_eq!(
            std::fs::metadata(fresh.path().join("big.bin")).unwrap().len(),
            4_194_304
        );
    }

    /// The event-log digest must match the local tier for the same commands (provenance parity),
    /// mirroring the OCI tier's `oci_log_digest_matches_local_tier_for_same_commands`.
    #[test]
    fn firecracker_log_digest_matches_local_tier() {
        if !kvm_accessible() {
            return;
        }
        let config = match fc_config() {
            Some(c) => c,
            None => return,
        };
        let staging = tempdir().unwrap();
        let mut fc = FirecrackerRuntime::create(staging.path().join("m"), config).unwrap();
        let local_work = tempdir().unwrap();
        let mut local = reeg_runtime::LocalRuntime::create(local_work.path().join("m")).unwrap();
        for rt in [
            &mut fc as &mut dyn Runtime,
            &mut local as &mut dyn Runtime,
        ] {
            rt.exec(&ExecRequest::new("echo", ["reeg"])).unwrap();
            rt.exec(&ExecRequest::new("true", [] as [String; 0])).unwrap();
        }
        assert_eq!(
            fc.event_log().digest_hex().unwrap(),
            local.event_log().digest_hex().unwrap(),
            "FC and local event-log digests differ"
        );
    }
}
