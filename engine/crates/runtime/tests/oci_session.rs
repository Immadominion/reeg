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
        let dir = match tempfile::tempdir() {
            Ok(d) => d,
            Err(_) => return false,
        };
        let bundle = dir.path().join("probe-bundle");
        std::fs::create_dir_all(&bundle).ok();
        let workdir = dir.path().join("probe-work");
        std::fs::create_dir_all(&workdir).ok();

        // Write a minimal spec that just tries to run true and exit.
        let uid = unsafe { libc::getuid() };
        let gid = unsafe { libc::getgid() };
        let is_root = uid == 0;
        let mut namespaces = vec![
            serde_json::json!({"type":"pid"}),
            serde_json::json!({"type":"mount"}),
        ];
        if !is_root { namespaces.push(serde_json::json!({"type":"user"})); }
        let mut linux = serde_json::json!({"namespaces": namespaces});
        if !is_root {
            linux["uidMappings"] = serde_json::json!([{"containerID":0,"hostID":uid,"size":1}]);
            linux["gidMappings"] = serde_json::json!([{"containerID":0,"hostID":gid,"size":1}]);
        }
        let spec = serde_json::json!({
            "ociVersion": "1.0.2",
            "process": {
                "terminal": false,
                "user": {"uid":0,"gid":0},
                "args": ["true"],
                "env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
                "cwd": "/",
                "noNewPrivileges": true
            },
            "root": {"path": rootfs.to_string_lossy(), "readonly": true},
            "mounts": [{"destination":"/proc","type":"proc","source":"proc"}],
            "linux": linux
        });
        std::fs::write(bundle.join("config.json"), serde_json::to_string(&spec).unwrap()).ok();
        let id = format!("reeg-probe-{}", std::process::id());
        let ok = std::process::Command::new("runc")
            .args(["run", "--bundle", &bundle.to_string_lossy(), &id])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        // Clean up if it somehow started
        let _ = std::process::Command::new("runc").args(["delete", "--force", &id]).status();
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
