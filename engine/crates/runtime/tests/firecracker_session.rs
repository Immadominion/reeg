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
        rt.exec(&sh("mkdir -p src && printf 'fn main() {}' > src/main.rs")).unwrap();
        rt.exec(&sh("printf 'hello reeg' > README")).unwrap();
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
        fc_rt.exec(&sh("printf 'same content' > file.txt")).unwrap();
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
}
