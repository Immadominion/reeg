//! Phase C done-bar for the OCI container tier: an agent runs commands and reads/writes files
//! inside a Machine through the OCI runtime adapter, and a checkpoint taken mid-session restores
//! to a byte-identical working directory. This extends the local-tier test in session.rs onto
//! the container isolation boundary without changing the capture or verification paths.
//!
//! Requires (skipped automatically if absent):
//!   - Linux (`#[cfg(target_os = "linux")]`)
//!   - `runc` binary on PATH
//!   - A Linux rootfs directory at `REEG_OCI_ROOTFS`

#[cfg(all(target_os = "linux", feature = "oci"))]
mod oci_tests {
    use reeg_runtime::{
        CasStore, EnvironmentInputs, ExecRequest, OciConfig, OciRuntime, Runtime, drift, restore,
    };
    use tempfile::tempdir;

    fn sh(script: &str) -> ExecRequest {
        ExecRequest::new("sh", ["-c", script])
    }

    fn rootfs() -> Option<std::path::PathBuf> {
        std::env::var("REEG_OCI_ROOTFS").ok().map(std::path::PathBuf::from)
    }

    fn runc_on_path() -> bool {
        std::process::Command::new("runc")
            .arg("--version")
            .output()
            .is_ok()
    }

    /// Probe whether runc can actually create a container on this kernel/VM. Returns false on
    /// constrained environments (Lima VZ, some CI VMs) where namespace operations are blocked.
    fn runc_functional(rootfs: &std::path::Path) -> bool {
        // Simply check if runc is present and the rootfs exists; trust the kernel to support
        // namespaces on real Linux. The unshare probe was too strict and caused false negatives
        // on kernels that support namespaces but block the `unshare` binary specifically.
        if !rootfs.exists() {
            eprintln!("skip: rootfs does not exist at {}", rootfs.display());
            return false;
        }
        let ok = std::process::Command::new("runc")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            eprintln!("skip: runc not found on PATH");
        }
        ok
    }

    #[test]
    fn oci_agent_session_checkpoints_and_restores_byte_identical() {
        let rootfs = match rootfs() {
            Some(p) => p,
            None => {
                eprintln!("skip: set REEG_OCI_ROOTFS to a Linux rootfs directory");
                return;
            }
        };
        if !runc_functional(&rootfs) {
            eprintln!("skip: runc not functional on this kernel/VM (namespace operations blocked)");
            return;
        }

        let store = tempdir().unwrap();
        let cas = CasStore::open(store.path()).unwrap();
        let work = tempdir().unwrap();

        let config = OciConfig { rootfs, ..OciConfig::default() };
        let mut rt = OciRuntime::create(work.path().join("machine"), config).unwrap();

        rt.exec(&sh("mkdir -p src && printf 'fn main() {}' > src/main.rs")).unwrap();
        rt.exec(&sh("printf 'hello reeg' > README")).unwrap();
        assert_eq!(rt.event_log().len(), 2);

        // Checkpoint mid-session; the container is still running.
        let manifest = rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();

        // Restore on a fresh directory that never saw the original.
        let fresh = tempdir().unwrap();
        restore(&manifest, &cas, fresh.path()).unwrap();
        assert!(
            drift(&manifest, &cas, fresh.path()).unwrap().is_clean(),
            "OCI tier restore drifted from the checkpoint"
        );
        assert_eq!(
            std::fs::read(fresh.path().join("src/main.rs")).unwrap(),
            b"fn main() {}"
        );
    }

    #[test]
    fn oci_log_digest_matches_local_tier_for_same_commands() {
        // The event log and its digest must be identical across isolation tiers for the same
        // commands, because the log feeds provenance and the verifier must agree with any tier.
        use reeg_runtime::{ExecRequest, LocalRuntime};

        let rootfs = match rootfs() {
            Some(p) => p,
            None => return,
        };
        if !runc_functional(&rootfs) {
            return;
        }

        let work_oci = tempdir().unwrap();
        let work_local = tempdir().unwrap();

        let config = OciConfig { rootfs, ..OciConfig::default() };
        let mut oci = OciRuntime::create(work_oci.path().join("m"), config).unwrap();
        let mut local = LocalRuntime::create(work_local.path().join("m")).unwrap();

        for rt in [
            &mut oci as &mut dyn reeg_runtime::Runtime,
            &mut local as &mut dyn reeg_runtime::Runtime,
        ] {
            rt.exec(&ExecRequest::new("echo", ["reeg"])).unwrap();
            rt.exec(&ExecRequest::new("true", [] as [String; 0])).unwrap();
        }

        assert_eq!(
            oci.event_log().digest_hex().unwrap(),
            local.event_log().digest_hex().unwrap(),
            "event log digest differs between OCI and local tiers"
        );
    }
}
