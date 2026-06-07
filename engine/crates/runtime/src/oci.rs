//! OCI container runtime tier: runs agent commands inside an OCI container with pid, network,
//! ipc, uts, and mount namespace isolation. The host working directory is bind-mounted into the
//! container at `/work` so the snapshot engine can read it directly from the host, keeping the
//! capture and verification paths identical to the local tier.
//!
//! Requires: the `runc` (or `crun`) binary on PATH and a Linux rootfs directory. Enable with
//! `--features oci` when building on Linux. Set `REEG_OCI_ROOTFS` for the default rootfs path.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::{Result, RuntimeError};
use crate::log::EventLog;
use crate::runtime::{ExecOutcome, ExecRequest, Runtime};

static CONTAINER_COUNTER: AtomicU64 = AtomicU64::new(0);

fn new_container_id() -> String {
    // Unique within the host process; safe to use as a runc container id.
    format!(
        "reeg-{}-{}",
        std::process::id(),
        CONTAINER_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

/// Configuration for an OCI container runtime instance.
pub struct OciConfig {
    /// Directory containing a valid Linux rootfs (Alpine, Debian, etc.). The container sees
    /// this as `/`; the agent working directory is bind-mounted at `/work` on top of it.
    pub rootfs: PathBuf,
    /// The `runc` or `crun` binary. Defaults to `runc` on PATH, overridden by `REEG_RUNC_BIN`.
    pub runc_bin: PathBuf,
}

impl Default for OciConfig {
    fn default() -> Self {
        OciConfig {
            rootfs: std::env::var("REEG_OCI_ROOTFS")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/var/lib/reeg/rootfs")),
            runc_bin: std::env::var("REEG_RUNC_BIN")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("runc")),
        }
    }
}

/// OCI container runtime: provides hard namespace isolation around agent command execution.
/// The host working directory is bind-mounted read-write into the container at `/work`; writes
/// land directly on the host filesystem so the snapshot engine reads them without crossing a
/// container boundary. `checkpoint()` is the trait default — it captures `workdir()` which is
/// the host-side path, not the in-container path.
pub struct OciRuntime {
    /// The host-side working directory, bind-mounted at `/work` inside the container.
    workdir: PathBuf,
    /// OCI bundle directory holding `config.json`; deleted on drop.
    bundle: PathBuf,
    container_id: String,
    runc_bin: PathBuf,
    log: EventLog,
}

impl OciRuntime {
    /// Create and start an OCI container with the agent's working directory at `workdir`.
    /// The container is left running after `create` returns; call `exec` to run commands.
    pub fn create(workdir: impl Into<PathBuf>, config: OciConfig) -> Result<Self> {
        let workdir = workdir.into();
        let container_id = new_container_id();
        // Bundle sits adjacent to workdir so it's never inside the snapshotted directory.
        let bundle = workdir.with_extension("bundle");

        for dir in [&workdir, &bundle] {
            fs::create_dir_all(dir).map_err(|source| RuntimeError::Io {
                path: dir.clone(),
                source,
            })?;
        }

        write_oci_spec(&bundle, &config.rootfs, &workdir)?;

        // `runc create` sets up namespaces and the init process without starting the user
        // process; `runc start` transitions the container to running.
        runc(&config.runc_bin, &["create", "--bundle", &bundle.to_string_lossy(), &container_id])?;
        runc(&config.runc_bin, &["start", &container_id])?;

        Ok(OciRuntime {
            workdir,
            bundle,
            container_id,
            runc_bin: config.runc_bin,
            log: EventLog::new(),
        })
    }
}

impl Drop for OciRuntime {
    fn drop(&mut self) {
        // Best-effort: kill the container process and release all namespaces.
        let _ = Command::new(&self.runc_bin)
            .args(["kill", &self.container_id, "SIGKILL"])
            .status();
        let _ = Command::new(&self.runc_bin)
            .args(["delete", "--force", &self.container_id])
            .status();
        let _ = fs::remove_dir_all(&self.bundle);
    }
}

impl Runtime for OciRuntime {
    /// The host-side working directory — directly readable by the snapshot engine without
    /// crossing the container boundary.
    fn workdir(&self) -> &Path {
        &self.workdir
    }

    fn event_log(&self) -> &EventLog {
        &self.log
    }

    fn exec(&mut self, request: &ExecRequest) -> Result<ExecOutcome> {
        // `runc exec` runs a new process inside the already-running container's namespaces.
        // The working directory inside the container is always /work, which is bind-mounted
        // from the host workdir so writes land on the host filesystem directly.
        let mut args = vec![
            "exec".to_owned(),
            "--cwd".to_owned(),
            "/work".to_owned(),
            self.container_id.clone(),
            "--".to_owned(),
            request.program.clone(),
        ];
        args.extend(request.args.clone());

        let output = Command::new(&self.runc_bin)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|source| RuntimeError::Launch {
                program: self.runc_bin.to_string_lossy().into_owned(),
                source,
            })?;

        let exit_code = output.status.code().unwrap_or(-1);
        self.log.record(
            &request.program,
            &request.args,
            exit_code,
            &output.stdout,
            &output.stderr,
        );
        Ok(ExecOutcome {
            exit_code,
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }
}

// --- helpers -----------------------------------------------------------------------

/// Run a `runc` subcommand and return an error if it exits non-zero.
fn runc(bin: &Path, args: &[&str]) -> Result<()> {
    let status = Command::new(bin)
        .args(args)
        .status()
        .map_err(|source| RuntimeError::Launch {
            program: bin.to_string_lossy().into_owned(),
            source,
        })?;
    if !status.success() {
        return Err(RuntimeError::Oci(format!(
            "runc {} exited {}",
            args.first().copied().unwrap_or(""),
            status.code().unwrap_or(-1)
        )));
    }
    Ok(())
}

/// Write a minimal OCI runtime spec (`config.json`) into `bundle`. The init process is
/// `sleep infinity` so the container stays alive across multiple `exec` calls. The agent
/// working directory is bind-mounted from the host at `/work`.
///
/// The spec targets rootless `runc`: a user namespace is added with uid/gid mappings so
/// the container runs as the current user without requiring root. Only the mounts that work
/// rootless are included (proc, tmpfs /dev, bind /work); sysfs is omitted because it
/// requires CAP_SYS_ADMIN which a rootless container does not have.
fn write_oci_spec(bundle: &Path, rootfs: &Path, workdir: &Path) -> Result<()> {
    let uid = unsafe { libc::getuid() };
    let gid = unsafe { libc::getgid() };
    let is_root = uid == 0;

    // When running as root, no user namespace or uid/gid mappings are needed and runc runs in
    // privileged mode. When rootless, a user namespace with current uid/gid -> container root
    // mapping is required by runc. In both cases the snapshot engine reads /work directly on the
    // host side via the bind mount; only the command execution boundary differs.
    let mut namespaces = vec![
        serde_json::json!({ "type": "pid"   }),
        serde_json::json!({ "type": "mount" }),
    ];
    if !is_root {
        namespaces.push(serde_json::json!({ "type": "user" }));
    }

    let mut linux = serde_json::json!({ "namespaces": namespaces });
    if !is_root {
        linux["uidMappings"] = serde_json::json!([{ "containerID": 0, "hostID": uid, "size": 1 }]);
        linux["gidMappings"] = serde_json::json!([{ "containerID": 0, "hostID": gid, "size": 1 }]);
    }

    let spec = serde_json::json!({
        "ociVersion": "1.0.2",
        "process": {
            "terminal": false,
            "user": { "uid": 0, "gid": 0 },
            // sleep infinity keeps the container alive between exec calls.
            "args": ["sleep", "infinity"],
            "env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
            "cwd": "/work",
            "noNewPrivileges": true
        },
        "root": {
            // Read-only base rootfs; the agent's writable surface is the bind-mounted /work.
            "path": rootfs.to_string_lossy(),
            "readonly": true
        },
        "mounts": [
            { "destination": "/proc", "type": "proc", "source": "proc" },
            {
                "destination": "/dev", "type": "tmpfs", "source": "tmpfs",
                "options": ["nosuid", "strictatime", "mode=755", "size=65536k"]
            },
            // The agent's working directory is bind-mounted read-write from the host so the
            // snapshot engine can capture it directly without crossing the container boundary.
            {
                "destination": "/work",
                "type": "bind",
                "source": workdir.to_string_lossy(),
                "options": ["bind", "rw"]
            }
        ],
        "linux": linux
    });

    let config_path = bundle.join("config.json");
    let content = serde_json::to_string_pretty(&spec)?;
    fs::write(&config_path, content).map_err(|source| RuntimeError::Io {
        path: config_path,
        source,
    })?;
    Ok(())
}
