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
        // Bundle sits adjacent to workdir (never inside the snapshotted directory) and is keyed by
        // the unique container id so two sessions sharing a workdir can't clobber each other's
        // config.json.
        let bundle = workdir.with_extension(format!("{container_id}.bundle"));

        for dir in [&workdir, &bundle] {
            fs::create_dir_all(dir).map_err(|source| RuntimeError::Io {
                path: dir.clone(),
                source,
            })?;
        }

        // runc requires the bind-mount destination to exist in the rootfs before it sets up
        // mounts. Alpine (and most minimal rootfs images) do not ship a /work directory, so
        // we create it here. This is idempotent and leaves a single empty directory in the
        // rootfs -- a negligible side effect of using a shared rootfs across sessions.
        let work_mountpoint = config.rootfs.join("work");
        if !work_mountpoint.exists() {
            fs::create_dir_all(&work_mountpoint).map_err(|source| RuntimeError::Io {
                path: work_mountpoint,
                source,
            })?;
        }

        write_oci_spec(&bundle, &config.rootfs, &workdir)?;

        // `runc create` sets up namespaces and the init process without starting the user
        // process; `runc start` transitions the container to running.
        runc(
            &config.runc_bin,
            &[
                "create",
                "--bundle",
                &bundle.to_string_lossy(),
                &container_id,
            ],
        )?;
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
        // Note: runc exec takes [options] <container-id> <command> [args...] -- no "--" separator.
        let mut args = vec!["exec".to_owned(), "--cwd".to_owned(), "/work".to_owned()];
        // Forward request env (e.g. REEG_MEMORY_DIR) into the container process.
        for (k, v) in &request.env {
            args.push("--env".to_owned());
            args.push(format!("{k}={v}"));
        }
        args.extend([self.container_id.clone(), request.program.clone()]);
        args.extend(request.args.clone());

        let mut command = Command::new(&self.runc_bin);
        command
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // Pin the canonical umask so the in-container process inherits it and captured file modes
        // match the other tiers regardless of the host's login umask. See `crate::umask`.
        {
            use std::os::unix::process::CommandExt;
            // SAFETY: the pre_exec closure only calls async-signal-safe `umask(2)`.
            unsafe {
                command.pre_exec(|| {
                    crate::apply_canonical_umask();
                    Ok(())
                });
            }
        }
        let output = command.output().map_err(|source| RuntimeError::Launch {
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

/// Write a hardened OCI runtime spec (`config.json`) into `bundle`. The init process is
/// `sleep infinity` so the container stays alive across multiple `exec` calls. The agent
/// working directory is bind-mounted from the host at `/work`.
///
/// The spec targets rootless `runc`: a user namespace is added with uid/gid mappings so the
/// container runs as the current user without requiring root. Isolation: pid + mount + network +
/// ipc + uts namespaces (the network namespace is fresh and empty, so the EC2 metadata service at
/// 169.254.169.254 and host loopback are unreachable); all capabilities dropped; a seccomp denylist
/// (default-allow, deny the dangerous syscalls untrusted code never legitimately needs); masked and
/// read-only paths over sensitive `/proc` and `/sys`; `noNewPrivileges` and a read-only root.
fn write_oci_spec(bundle: &Path, rootfs: &Path, workdir: &Path) -> Result<()> {
    let uid = unsafe { libc::getuid() };
    let gid = unsafe { libc::getgid() };
    let is_root = uid == 0;

    // When running as root, no user namespace or uid/gid mappings are needed and runc runs in
    // privileged mode. When rootless, a user namespace with current uid/gid -> container root
    // mapping is required by runc. In both cases the snapshot engine reads /work directly on the
    // host side via the bind mount; only the command execution boundary differs.
    // Hard namespace isolation: pid, mount, network, ipc, uts (+ user when rootless). The fresh
    // network namespace has no route to the host network — closing access to 169.254.169.254
    // (EC2 metadata / credentials) and host loopback. ipc/uts isolate System V IPC and hostname.
    let mut namespaces = vec![
        serde_json::json!({ "type": "pid"     }),
        serde_json::json!({ "type": "mount"   }),
        serde_json::json!({ "type": "network" }),
        serde_json::json!({ "type": "ipc"     }),
        serde_json::json!({ "type": "uts"     }),
    ];
    if !is_root {
        namespaces.push(serde_json::json!({ "type": "user" }));
    } else {
        // cgroup namespace is only reliably available to a privileged runc; best-effort, not load
        // bearing for the core isolation above.
        namespaces.push(serde_json::json!({ "type": "cgroup" }));
    }

    // Drop every capability: the `sleep` init and the agent's commands need none, and
    // noNewPrivileges below prevents a child from regaining any.
    let capabilities = serde_json::json!({
        "bounding": [],
        "effective": [],
        "permitted": [],
        "inheritable": [],
        "ambient": []
    });

    // Seccomp DENYLIST: default-allow so ordinary tools (sh, mkdir, printf, coreutils) run, but
    // deny the syscalls untrusted code never legitimately needs and that enable escape or host
    // tampering — mount/namespace manipulation, kernel module/instrumentation, raw packet sockets,
    // process introspection, time/keyring/message-queue primitives. `execve` is intentionally NOT
    // denied (the container must launch programs; noNewPrivileges blocks setuid escalation). runc
    // sets up the container mounts before applying this profile to the workload, so denying
    // `mount`/`pivot_root` here does not break container setup.
    let seccomp = serde_json::json!({
        "defaultAction": "SCMP_ACT_ALLOW",
        "architectures": ["SCMP_ARCH_X86_64", "SCMP_ARCH_X86", "SCMP_ARCH_X32"],
        "syscalls": [
            { "names": ["ptrace", "process_vm_readv", "process_vm_writev"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["mount", "umount2", "pivot_root", "chroot", "move_mount", "open_tree", "fsopen", "fsconfig", "fsmount"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["setns", "unshare"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["bpf", "perf_event_open"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["kexec_load", "kexec_file_load", "reboot"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["init_module", "finit_module", "delete_module"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["ioperm", "iopl", "ioprio_set"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["swapon", "swapoff"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["clock_settime", "clock_adjtime", "settimeofday", "adjtimex"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["keyctl", "add_key", "request_key"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["mq_open", "mq_unlink", "mq_timedsend", "mq_timedreceive", "mq_notify", "mq_getsetattr"], "action": "SCMP_ACT_ERRNO" },
            // io_uring and userfaultfd are capability-independent kernel-exploitation surfaces
            // (multiple CVEs) that a sandboxed agent never legitimately needs.
            { "names": ["io_uring_setup", "io_uring_enter", "io_uring_register"], "action": "SCMP_ACT_ERRNO" },
            { "names": ["userfaultfd"], "action": "SCMP_ACT_ERRNO" },
            // Deny raw packet sockets (AF_PACKET=17) and the netlink kernel interface (AF_NETLINK=16).
            // seccomp arg rules within one entry are AND-ed, so each family needs its own rule.
            { "names": ["socket"], "action": "SCMP_ACT_ERRNO", "args": [{ "index": 0, "value": 17, "op": "SCMP_CMP_EQ" }] },
            { "names": ["socket"], "action": "SCMP_ACT_ERRNO", "args": [{ "index": 0, "value": 16, "op": "SCMP_CMP_EQ" }] }
        ]
    });

    let mut linux = serde_json::json!({
        "namespaces": namespaces,
        "seccomp": seccomp
    });
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
            // All capabilities dropped (OCI puts capabilities under `process`, not `linux`).
            "capabilities": capabilities,
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
        "maskedPaths": [
            "/proc/asound", "/proc/bus", "/proc/fs", "/proc/irq", "/proc/kallsyms",
            "/proc/kcore", "/proc/keys", "/proc/sys", "/proc/sysrq-trigger", "/proc/sysvipc",
            "/sys/firmware", "/sys/kernel/debug", "/sys/kernel/security"
        ],
        "readonlyPaths": [
            "/proc/asound", "/proc/bus", "/proc/fs", "/proc/irq", "/sys"
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// Regression guard (no runc/KVM needed): the generated OCI spec must stay hardened, so the
    /// seccomp denylist and namespace/capability posture cannot silently regress.
    #[test]
    fn oci_spec_is_hardened_and_valid() {
        let bundle = tempfile::tempdir().unwrap();
        let rootfs = tempfile::tempdir().unwrap();
        let workdir = tempfile::tempdir().unwrap();
        write_oci_spec(bundle.path(), rootfs.path(), workdir.path()).unwrap();
        let cfg: serde_json::Value =
            serde_json::from_slice(&fs::read(bundle.path().join("config.json")).unwrap()).unwrap();

        let ns: HashSet<String> = cfg["linux"]["namespaces"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n["type"].as_str().unwrap().to_string())
            .collect();
        for t in ["pid", "mount", "network", "ipc", "uts"] {
            assert!(ns.contains(t), "namespace {t} missing from {ns:?}");
        }

        for set in [
            "bounding",
            "effective",
            "permitted",
            "inheritable",
            "ambient",
        ] {
            assert!(
                cfg["process"]["capabilities"][set]
                    .as_array()
                    .unwrap()
                    .is_empty(),
                "capability set {set} should be empty"
            );
        }
        assert_eq!(cfg["process"]["noNewPrivileges"], serde_json::json!(true));
        assert_eq!(cfg["root"]["readonly"], serde_json::json!(true));

        assert_eq!(cfg["linux"]["seccomp"]["defaultAction"], "SCMP_ACT_ALLOW");
        let denied: HashSet<String> = cfg["linux"]["seccomp"]["syscalls"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|r| {
                r["names"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|n| n.as_str().unwrap().to_string())
            })
            .collect();
        for s in [
            "ptrace",
            "mount",
            "pivot_root",
            "bpf",
            "io_uring_setup",
            "io_uring_enter",
            "userfaultfd",
            "keyctl",
            "setns",
            "kexec_load",
        ] {
            assert!(denied.contains(s), "seccomp must deny {s}");
        }
        // The container must still be able to launch programs.
        assert!(!denied.contains("execve"), "seccomp must not deny execve");

        let masked: HashSet<String> = cfg["maskedPaths"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap().to_string())
            .collect();
        assert!(
            masked.contains("/proc/kcore"),
            "maskedPaths must hide /proc/kcore"
        );
    }
}
