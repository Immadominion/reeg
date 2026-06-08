//! Firecracker microVM runtime tier: runs each agent session inside a dedicated Linux VM,
//! providing hard kernel-level isolation for multi-tenant workloads. The Firecracker process
//! exposes a REST API over a Unix socket; exec requests are forwarded to an in-guest agent
//! over vsock. At checkpoint time the guest agent streams the working directory as a tar
//! archive so the snapshot engine captures it from the host — the capture and verification
//! paths are identical to the other tiers.
//!
//! Requires: the `firecracker` binary on PATH (or `FIRECRACKER_BIN`), a Linux kernel image
//! (vmlinux), a rootfs ext4 image that includes `reeg-engine` at `/sbin/reeg-engine`, and
//! `/dev/kvm` accessible. Linux only; enable with `--features firecracker`.
//!
//! Guest agent protocol (vsock, length-prefixed JSON frames):
//!   exec request:     `{"type":"exec","program":"...","args":[...],"cwd":"/work"}`
//!   exec response:    `{"exit_code":0,"stdout_hex":"...","stderr_hex":"..."}`
//!   snapshot request: `{"type":"snapshot"}`
//!   snapshot response: raw tar bytes (4-byte big-endian length prefix + tar archive)

use std::fs;
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use reeg_snapshot::{CasStore, EnvironmentInputs, Manifest};

use crate::error::{Result, RuntimeError};
use crate::log::EventLog;
use crate::runtime::{ExecOutcome, ExecRequest, Runtime};

static VM_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Configuration for a Firecracker microVM runtime instance.
pub struct FirecrackerConfig {
    /// Linux kernel image (vmlinux or bzImage) to boot inside the VM.
    pub kernel_path: PathBuf,
    /// Read-only ext4 rootfs image containing the OS and `/sbin/reeg-engine`.
    pub rootfs_path: PathBuf,
    /// Number of vCPUs allocated to the VM.
    pub vcpu_count: u8,
    /// Memory size in MiB.
    pub mem_size_mib: u32,
    /// The `firecracker` binary; defaults to `firecracker` on PATH.
    pub firecracker_bin: PathBuf,
    /// vsock port the in-guest `reeg-engine guest-agent` listens on.
    pub agent_port: u32,
}

impl Default for FirecrackerConfig {
    fn default() -> Self {
        FirecrackerConfig {
            kernel_path: std::env::var("REEG_FC_KERNEL")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/var/lib/reeg/vmlinux")),
            rootfs_path: std::env::var("REEG_FC_ROOTFS")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/var/lib/reeg/rootfs.ext4")),
            vcpu_count: 1,
            mem_size_mib: 512,
            firecracker_bin: std::env::var("FIRECRACKER_BIN")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("firecracker")),
            agent_port: 52,
        }
    }
}

/// Firecracker microVM runtime: each session gets a dedicated Linux kernel and memory space.
/// Agent commands run inside the VM; the working directory is transferred to the host at
/// checkpoint time via vsock so the snapshot and verification paths are unchanged.
pub struct FirecrackerRuntime {
    /// Host-side staging directory populated from the VM's `/work` on each `checkpoint` call.
    staging: PathBuf,
    /// Firecracker REST API socket path.
    api_socket: PathBuf,
    /// Host-side Unix socket Firecracker creates for vsock proxying.
    vsock_uds: PathBuf,
    /// vsock port the in-guest agent is listening on.
    agent_port: u32,
    /// The running Firecracker process; held here so the VM lives as long as this struct does.
    _process: Child,
    log: EventLog,
}

impl FirecrackerRuntime {
    /// Boot a Firecracker microVM and wait for the in-guest agent to accept connections.
    pub fn create(staging: impl Into<PathBuf>, config: FirecrackerConfig) -> Result<Self> {
        let staging = staging.into();
        let vm_id = VM_COUNTER.fetch_add(1, Ordering::Relaxed);
        let run_dir = staging.with_extension(format!("vm-{vm_id}"));

        for dir in [&staging, &run_dir] {
            fs::create_dir_all(dir).map_err(|source| RuntimeError::Io {
                path: dir.clone(),
                source,
            })?;
        }

        let api_socket = run_dir.join("api.sock");
        let vsock_uds = run_dir.join("vsock.sock");

        // Firecracker creates the API socket on start; we wait for it before sending config.
        // --log-path was removed from the Firecracker CLI in v1.x; logging is configured via
        // the API after boot if needed. Redirect stderr to a file so startup failures are
        // readable rather than silently lost.
        let stderr_log = run_dir.join("firecracker.stderr");
        let stderr_file = fs::File::create(&stderr_log).map_err(|source| RuntimeError::Io {
            path: stderr_log.clone(),
            source,
        })?;
        let process = Command::new(&config.firecracker_bin)
            .arg("--api-sock")
            .arg(&api_socket)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(stderr_file)
            .spawn()
            .map_err(|source| RuntimeError::Launch {
                program: config.firecracker_bin.to_string_lossy().into_owned(),
                source,
            })?;

        // Wait for the API socket; on failure read the stderr log for a useful error message.
        if let Err(e) = wait_for_path(&api_socket, Duration::from_secs(5)) {
            let detail = fs::read_to_string(&stderr_log).unwrap_or_default();
            return Err(RuntimeError::MicroVm(format!(
                "{e}: firecracker stderr: {detail}"
            )));
        }

        // Configure the VM via the Firecracker REST API before booting.
        fc_put(
            &api_socket,
            "/machine-config",
            &serde_json::json!({
                "vcpu_count": config.vcpu_count,
                "mem_size_mib": config.mem_size_mib
            }),
        )?;

        fc_put(
            &api_socket,
            "/boot-source",
            &serde_json::json!({
                "kernel_image_path": config.kernel_path.to_string_lossy(),
                // console=ttyS0 for debug output; panic=1 halts on kernel panic rather than rebooting.
                "boot_args": "console=ttyS0 reboot=k panic=1 pci=off"
            }),
        )?;

        // Rootfs drive: read-write so the guest agent can create /work and write files there.
        // In production a per-session tmpfs or scratch drive is preferred; for now a single
        // read-write root is sufficient because the guest agent cleans /work at startup and
        // tests run sequentially (--test-threads=1).
        fc_put(
            &api_socket,
            "/drives/rootfs",
            &serde_json::json!({
                "drive_id": "rootfs",
                "path_on_host": config.rootfs_path.to_string_lossy(),
                "is_root_device": true,
                "is_read_only": false
            }),
        )?;

        // vsock device: Firecracker multiplexes guest vsock connections over a host-side Unix
        // socket. To connect to the guest on port P, the host connects to vsock_uds and sends
        // the CONNECT handshake (see `vsock_connect`).
        fc_put(
            &api_socket,
            "/vsock",
            &serde_json::json!({
                "guest_cid": 3,
                "uds_path": vsock_uds.to_string_lossy()
            }),
        )?;

        // InstanceStart boots the VM; the call returns as soon as the VM begins executing.
        fc_put(
            &api_socket,
            "/actions",
            &serde_json::json!({ "action_type": "InstanceStart" }),
        )?;

        // Poll until the in-guest agent accepts connections (Firecracker boots in ~125 ms).
        wait_for_agent(&vsock_uds, config.agent_port, Duration::from_secs(10))?;

        Ok(FirecrackerRuntime {
            staging,
            api_socket,
            vsock_uds,
            agent_port: config.agent_port,
            _process: process,
            log: EventLog::new(),
        })
    }
}

impl Drop for FirecrackerRuntime {
    fn drop(&mut self) {
        // Request a clean guest shutdown before the process guard drops and kills Firecracker.
        let _ = fc_put(
            &self.api_socket,
            "/actions",
            &serde_json::json!({ "action_type": "SendCtrlAltDel" }),
        );
    }
}

impl Runtime for FirecrackerRuntime {
    /// The host-side staging directory, populated from the VM's `/work` at each `checkpoint`.
    fn workdir(&self) -> &Path {
        &self.staging
    }

    fn event_log(&self) -> &EventLog {
        &self.log
    }

    fn exec(&mut self, request: &ExecRequest) -> Result<ExecOutcome> {
        let req = serde_json::json!({
            "type": "exec",
            "program": request.program,
            "args": request.args,
            "cwd": "/work"
        });
        let resp = vsock_json(&self.vsock_uds, self.agent_port, &req, Duration::from_secs(300))?;

        let exit_code = resp["exit_code"].as_i64().unwrap_or(-1) as i32;
        let stdout = hex::decode(resp["stdout_hex"].as_str().unwrap_or("")).unwrap_or_default();
        let stderr = hex::decode(resp["stderr_hex"].as_str().unwrap_or("")).unwrap_or_default();

        self.log.record(&request.program, &request.args, exit_code, &stdout, &stderr);
        Ok(ExecOutcome { exit_code, stdout, stderr })
    }

    fn checkpoint(&self, cas: &CasStore, inputs: EnvironmentInputs) -> Result<Manifest> {
        // Ask the guest agent to tar up `/work` and stream it back.
        let req = serde_json::json!({ "type": "snapshot" });
        let tar_bytes = vsock_tar(&self.vsock_uds, self.agent_port, &req, Duration::from_secs(600))?;

        // Wipe and repopulate the staging directory so stale files from a previous checkpoint
        // never pollute the manifest; the snapshot engine sees a clean point-in-time copy.
        if self.staging.exists() {
            fs::remove_dir_all(&self.staging).map_err(|source| RuntimeError::Io {
                path: self.staging.clone(),
                source,
            })?;
        }
        fs::create_dir_all(&self.staging).map_err(|source| RuntimeError::Io {
            path: self.staging.clone(),
            source,
        })?;
        unpack_tar(&tar_bytes, &self.staging)?;

        Ok(reeg_snapshot::checkpoint(&self.staging, cas, inputs)?)
    }
}

// --- Firecracker REST API (HTTP/1.1 over Unix domain socket) -------------------------

/// Send a PUT request to the Firecracker API socket. Most endpoints return 204 No Content
/// on success; we accept any 2xx status.
fn fc_put(socket: &Path, path: &str, body: &serde_json::Value) -> Result<()> {
    let body_str = serde_json::to_string(body)?;
    let request = format!(
        "PUT {path} HTTP/1.1\r\n\
         Host: localhost\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {len}\r\n\
         Accept: application/json\r\n\
         \r\n\
         {body_str}",
        len = body_str.len()
    );

    let mut stream = UnixStream::connect(socket).map_err(|e| {
        RuntimeError::MicroVm(format!("connect to Firecracker API socket: {e}"))
    })?;
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();

    stream.write_all(request.as_bytes()).map_err(|e| {
        RuntimeError::MicroVm(format!("write Firecracker API request: {e}"))
    })?;

    let mut resp = String::new();
    let mut buf = [0u8; 4096];
    loop {
        match stream.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => resp.push_str(&String::from_utf8_lossy(&buf[..n])),
        }
        if resp.contains("\r\n\r\n") {
            break;
        }
    }

    let first_line = resp.lines().next().unwrap_or("");
    if !first_line.contains("HTTP/1.1 2") {
        return Err(RuntimeError::MicroVm(format!(
            "Firecracker API {path}: {first_line}"
        )));
    }
    Ok(())
}

// --- vsock helpers (host side, via Firecracker Unix socket proxy) ---------------------

/// Connect to the in-guest vsock agent via Firecracker's Unix socket proxy.
/// Firecracker multiplexes vsock via a CONNECT handshake: send `CONNECT {port}\n`,
/// receive `OK {host_port}\n`, then the connection is live.
fn vsock_connect(uds_path: &Path, port: u32) -> Result<UnixStream> {
    let mut stream = UnixStream::connect(uds_path).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock UDS connect: {e}"))
    })?;

    write!(stream, "CONNECT {port}\n").map_err(|e| {
        RuntimeError::MicroVm(format!("vsock CONNECT send: {e}"))
    })?;
    stream.flush().map_err(|e| {
        RuntimeError::MicroVm(format!("vsock CONNECT flush: {e}"))
    })?;

    // Read the response byte-by-byte until newline to avoid consuming data past the header.
    let mut handshake = String::new();
    let mut byte = [0u8; 1];
    loop {
        stream.read_exact(&mut byte).map_err(|e| {
            RuntimeError::MicroVm(format!("vsock handshake read: {e}"))
        })?;
        handshake.push(byte[0] as char);
        if byte[0] == b'\n' {
            break;
        }
    }
    if !handshake.starts_with("OK ") {
        return Err(RuntimeError::MicroVm(format!(
            "vsock handshake: unexpected response {handshake:?}"
        )));
    }
    Ok(stream)
}

/// Send a JSON request and receive a JSON response, both length-prefixed (4-byte big-endian).
fn vsock_json(
    uds_path: &Path,
    port: u32,
    req: &serde_json::Value,
    timeout: Duration,
) -> Result<serde_json::Value> {
    let mut stream = vsock_connect(uds_path, port)?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

    let req_bytes = serde_json::to_vec(req)?;
    stream.write_all(&(req_bytes.len() as u32).to_be_bytes()).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock write length: {e}"))
    })?;
    stream.write_all(&req_bytes).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock write payload: {e}"))
    })?;

    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock read response length: {e}"))
    })?;
    let mut resp = vec![0u8; u32::from_be_bytes(len_buf) as usize];
    stream.read_exact(&mut resp).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock read response payload: {e}"))
    })?;

    Ok(serde_json::from_slice(&resp)?)
}

/// Send a snapshot JSON request and receive a raw tar archive (4-byte length prefix + bytes).
fn vsock_tar(
    uds_path: &Path,
    port: u32,
    req: &serde_json::Value,
    timeout: Duration,
) -> Result<Vec<u8>> {
    let mut stream = vsock_connect(uds_path, port)?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

    let req_bytes = serde_json::to_vec(req)?;
    stream.write_all(&(req_bytes.len() as u32).to_be_bytes()).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock snapshot write length: {e}"))
    })?;
    stream.write_all(&req_bytes).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock snapshot write payload: {e}"))
    })?;

    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock snapshot read tar length: {e}"))
    })?;
    let tar_len = u32::from_be_bytes(len_buf) as usize;
    let mut tar = vec![0u8; tar_len];
    stream.read_exact(&mut tar).map_err(|e| {
        RuntimeError::MicroVm(format!("vsock snapshot read tar bytes: {e}"))
    })?;
    Ok(tar)
}

/// Poll until the guest agent accepts a vsock connection or the timeout elapses.
fn wait_for_agent(uds_path: &Path, port: u32, timeout: Duration) -> Result<()> {
    let start = std::time::Instant::now();
    loop {
        if vsock_connect(uds_path, port).is_ok() {
            return Ok(());
        }
        if start.elapsed() >= timeout {
            return Err(RuntimeError::MicroVm(
                "guest agent did not become ready within the timeout".into(),
            ));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Wait for a filesystem path to appear (e.g., the Firecracker API socket).
fn wait_for_path(path: &Path, timeout: Duration) -> Result<()> {
    let start = std::time::Instant::now();
    loop {
        if path.exists() {
            return Ok(());
        }
        if start.elapsed() >= timeout {
            return Err(RuntimeError::MicroVm(format!(
                "path did not appear within timeout: {}",
                path.display()
            )));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

// --- tar helpers -----------------------------------------------------------------------

/// Unpack an in-memory tar archive into `dest` using the system `tar` binary.
/// The archive comes from the trusted in-guest agent; `tar -x` handles relative paths safely.
fn unpack_tar(archive: &[u8], dest: &Path) -> Result<()> {
    let mut child = Command::new("tar")
        .args(["-x", "-C", &dest.to_string_lossy()])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|source| RuntimeError::Launch {
            program: "tar".into(),
            source,
        })?;

    child
        .stdin
        .take()
        .expect("stdin was piped")
        .write_all(archive)
        .map_err(|e| RuntimeError::MicroVm(format!("write tar archive to stdin: {e}")))?;

    let output = child.wait_with_output().map_err(|e| {
        RuntimeError::MicroVm(format!("tar wait_with_output: {e}"))
    })?;
    if !output.status.success() {
        return Err(RuntimeError::MicroVm(format!(
            "tar extraction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(())
}
