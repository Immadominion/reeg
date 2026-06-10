//! Firecracker microVM runtime tier: runs each agent session inside a dedicated Linux VM,
//! providing hard kernel-level isolation for multi-tenant workloads. The Firecracker process
//! exposes a REST API over a Unix socket; exec requests are forwarded to an in-guest agent
//! over vsock. At checkpoint time the guest agent streams the working directory as a tar
//! archive so the snapshot engine captures it from the host — the capture and verification
//! paths are identical to the other tiers.
//!
//! Requires: the `firecracker` binary on PATH (or `FIRECRACKER_BIN`), a Linux kernel image
//! (vmlinux), a read-only ext4 rootfs image that includes `reeg-engine` at `/sbin/reeg-engine`,
//! and `/dev/kvm` accessible. Linux only; enable with `--features firecracker`.
//!
//! Isolation: the rootfs drive is mounted read-only and `/work` is a per-session tmpfs the
//! guest init mounts, so one session's writes are ephemeral and never bleed into another.
//!
//! Guest agent protocol (vsock, length-prefixed JSON frames):
//!   exec request:     `{"type":"exec","program":"...","args":[...],"cwd":"/work"}`
//!   exec response:    `{"exit_code":0,"stdout_hex":"...","stderr_hex":"..."}`
//!   snapshot request: `{"type":"snapshot"}`
//!   snapshot response: raw tar bytes (8-byte big-endian length prefix + tar archive)

use std::fs;
use std::io::{Cursor, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use reeg_snapshot::{CasStore, EnvironmentInputs, Manifest};

use crate::error::{Result, RuntimeError};
use crate::log::EventLog;
use crate::runtime::{ExecOutcome, ExecRequest, Runtime};

static VM_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Maximum size of a single JSON frame (exec request/response): 8 MiB. Must match the guest's
/// `MAX_EXEC_FRAME` in `guest_agent.rs`.
const MAX_FRAME_JSON: u64 = 8 * 1024 * 1024;

/// Maximum size of the snapshot tar frame: 8 GiB. The u64 length prefix removes the silent
/// >4 GiB truncation that a u32 prefix caused. Must match the guest's `MAX_TAR_FRAME`.
const MAX_FRAME_TAR: u64 = 8 * 1024 * 1024 * 1024;

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
    /// Seconds to wait for the Firecracker API socket to appear at startup (default 5).
    pub api_socket_timeout_secs: u64,
    /// Seconds to wait for the in-guest agent to accept connections (default 10).
    pub agent_ready_timeout_secs: u64,
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
            api_socket_timeout_secs: 5,
            agent_ready_timeout_secs: 10,
        }
    }
}

/// RAII guard that kills the Firecracker process and removes its run directory if `create`
/// returns early (a partial-init failure must not leak a live VM or its sockets). It is disarmed
/// once the `FirecrackerRuntime` is fully constructed and takes ownership of both, after which the
/// struct's own `Drop` is responsible for cleanup.
struct VmGuard {
    process: Option<Child>,
    run_dir: PathBuf,
    armed: bool,
}

impl VmGuard {
    fn new(process: Child, run_dir: PathBuf) -> Self {
        VmGuard {
            process: Some(process),
            run_dir,
            armed: true,
        }
    }

    /// Take back the process and stop the guard from cleaning up: the caller now owns the VM.
    fn disarm(&mut self) -> Child {
        self.armed = false;
        self.process.take().expect("process present until disarm")
    }
}

impl Drop for VmGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        // Error path: kill and reap the half-initialized VM, then remove its run directory.
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = fs::remove_dir_all(&self.run_dir);
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
    /// The running Firecracker process; killed and reaped on `Drop`.
    process: Child,
    /// Host-side run directory (API socket, vsock socket, stderr log); removed on `Drop`.
    run_dir: PathBuf,
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

        // Arm the cleanup guard immediately: from here, any early return kills and reaps the VM
        // and removes its run directory instead of leaking it.
        let mut guard = VmGuard::new(process, run_dir.clone());

        // Wait for the API socket; on failure read the stderr log for a useful error message.
        if let Err(e) = wait_for_path(
            &api_socket,
            Duration::from_secs(config.api_socket_timeout_secs),
        ) {
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
                // ro: the rootfs is mounted read-only; the guest init mounts /work as an ephemeral tmpfs.
                "boot_args": "console=ttyS0 reboot=k panic=1 pci=off ro"
            }),
        )?;

        // Rootfs drive: read-only, so guest writes cannot persist to the shared image. The guest
        // init mounts a per-session tmpfs at /work (its only writable surface), giving cross-tenant
        // isolation: one session's writes are RAM-resident and vanish when the VM dies.
        fc_put(
            &api_socket,
            "/drives/rootfs",
            &serde_json::json!({
                "drive_id": "rootfs",
                "path_on_host": config.rootfs_path.to_string_lossy(),
                "is_root_device": true,
                "is_read_only": true
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
        wait_for_agent(
            &vsock_uds,
            config.agent_port,
            Duration::from_secs(config.agent_ready_timeout_secs),
        )?;

        // Construction succeeded: take ownership of the process and disarm the guard so it does
        // not kill the VM or delete the run directory the returned struct depends on.
        let process = guard.disarm();

        Ok(FirecrackerRuntime {
            staging,
            api_socket,
            vsock_uds,
            agent_port: config.agent_port,
            process,
            run_dir,
            log: EventLog::new(),
        })
    }
}

impl Drop for FirecrackerRuntime {
    fn drop(&mut self) {
        // Request a clean guest shutdown, then reap: try_wait for ~2s before force-killing so the
        // guest gets a chance to halt, but never block indefinitely.
        let _ = fc_put(
            &self.api_socket,
            "/actions",
            &serde_json::json!({ "action_type": "SendCtrlAltDel" }),
        );
        for _ in 0..20 {
            match self.process.try_wait() {
                Ok(Some(_)) => {
                    let _ = fs::remove_dir_all(&self.run_dir);
                    return;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        let _ = self.process.kill();
        let _ = self.process.wait();
        let _ = fs::remove_dir_all(&self.run_dir);
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
        let resp = vsock_json(
            &self.vsock_uds,
            self.agent_port,
            &req,
            Duration::from_secs(300),
        )?;

        // Strict response parsing: a missing exit code or malformed hex is a protocol error, not a
        // silently-wrong provenance record.
        let exit_code = resp["exit_code"].as_i64().ok_or_else(|| {
            RuntimeError::MicroVm("exec response missing or invalid exit_code".into())
        })? as i32;
        let stdout = decode_hex_field(&resp, "stdout_hex")?;
        let stderr = decode_hex_field(&resp, "stderr_hex")?;

        self.log
            .record(&request.program, &request.args, exit_code, &stdout, &stderr);
        Ok(ExecOutcome {
            exit_code,
            stdout,
            stderr,
        })
    }

    fn checkpoint(&self, cas: &CasStore, inputs: EnvironmentInputs) -> Result<Manifest> {
        // Ask the guest agent to tar up `/work` and stream it back.
        let req = serde_json::json!({ "type": "snapshot" });
        let tar_bytes = vsock_tar(
            &self.vsock_uds,
            self.agent_port,
            &req,
            Duration::from_secs(600),
        )?;

        // Atomic staging: extract into a temp dir, then rename into place only on success, so a
        // failed extraction never leaves `staging` half-populated for the snapshot engine. The temp
        // dir lives inside this session's unique `run_dir`, so concurrent sessions never collide on
        // it (the caller is still responsible for a unique `staging` path per Machine).
        let temp_staging = self.run_dir.join("staging.tmp");
        if temp_staging.exists() {
            fs::remove_dir_all(&temp_staging).map_err(|source| RuntimeError::Io {
                path: temp_staging.clone(),
                source,
            })?;
        }
        fs::create_dir_all(&temp_staging).map_err(|source| RuntimeError::Io {
            path: temp_staging.clone(),
            source,
        })?;

        if let Err(e) = unpack_tar(&tar_bytes, &temp_staging) {
            let _ = fs::remove_dir_all(&temp_staging);
            return Err(e);
        }
        if self.staging.exists() {
            fs::remove_dir_all(&self.staging).map_err(|source| RuntimeError::Io {
                path: self.staging.clone(),
                source,
            })?;
        }
        fs::rename(&temp_staging, &self.staging).map_err(|source| RuntimeError::Io {
            path: self.staging.clone(),
            source,
        })?;

        Ok(reeg_snapshot::checkpoint(&self.staging, cas, inputs)?)
    }
}

/// Decode a required hex-encoded string field from a guest response, erroring on a missing field
/// or invalid hex rather than substituting empty output.
fn decode_hex_field(resp: &serde_json::Value, field: &str) -> Result<Vec<u8>> {
    let hex_str = resp[field].as_str().ok_or_else(|| {
        RuntimeError::MicroVm(format!("exec response missing or invalid {field}"))
    })?;
    hex::decode(hex_str)
        .map_err(|e| RuntimeError::MicroVm(format!("exec response {field} hex decode: {e}")))
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

    let mut stream = UnixStream::connect(socket)
        .map_err(|e| RuntimeError::MicroVm(format!("connect to Firecracker API socket: {e}")))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| RuntimeError::MicroVm(format!("set Firecracker API write timeout: {e}")))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| RuntimeError::MicroVm(format!("set Firecracker API read timeout: {e}")))?;

    stream
        .write_all(request.as_bytes())
        .map_err(|e| RuntimeError::MicroVm(format!("write Firecracker API request: {e}")))?;

    // Accumulate raw bytes until the header block ends; distinguish EOF, timeout, and error
    // rather than treating a read error as a clean end of response.
    let mut resp_bytes = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => resp_bytes.extend_from_slice(&buf[..n]),
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                return Err(RuntimeError::MicroVm(format!(
                    "Firecracker API {path}: read timeout"
                )));
            }
            Err(e) => {
                return Err(RuntimeError::MicroVm(format!(
                    "Firecracker API {path}: read error: {e}"
                )));
            }
        }
        if resp_bytes.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }

    let resp_str = String::from_utf8_lossy(&resp_bytes);
    let status = resp_str
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok());
    match status {
        Some(code) if (200..300).contains(&code) => Ok(()),
        _ => Err(RuntimeError::MicroVm(format!(
            "Firecracker API {path}: {}",
            resp_str.lines().next().unwrap_or("(no status line)")
        ))),
    }
}

// --- vsock helpers (host side, via Firecracker Unix socket proxy) ---------------------

/// Connect to the in-guest vsock agent via Firecracker's Unix socket proxy.
/// Firecracker multiplexes vsock via a CONNECT handshake: send `CONNECT {port}\n`,
/// receive `OK {host_port}\n`, then the connection is live. A read timeout and a bounded
/// handshake length keep `wait_for_agent` from blocking forever on a stuck proxy.
fn vsock_connect(uds_path: &Path, port: u32) -> Result<UnixStream> {
    let mut stream = UnixStream::connect(uds_path)
        .map_err(|e| RuntimeError::MicroVm(format!("vsock UDS connect: {e}")))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| RuntimeError::MicroVm(format!("set vsock handshake read timeout: {e}")))?;

    // The Firecracker vsock proxy expects a newline-terminated `CONNECT {port}` line.
    writeln!(stream, "CONNECT {port}")
        .map_err(|e| RuntimeError::MicroVm(format!("vsock CONNECT send: {e}")))?;
    stream
        .flush()
        .map_err(|e| RuntimeError::MicroVm(format!("vsock CONNECT flush: {e}")))?;

    // Read the response byte-by-byte until newline, bounded so a misbehaving proxy can't stream
    // forever without a delimiter.
    const MAX_HANDSHAKE_LEN: usize = 256;
    let mut handshake = String::new();
    let mut byte = [0u8; 1];
    loop {
        if handshake.len() >= MAX_HANDSHAKE_LEN {
            return Err(RuntimeError::MicroVm(
                "vsock handshake exceeded maximum length".into(),
            ));
        }
        match stream.read_exact(&mut byte) {
            Ok(()) => {}
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                return Err(RuntimeError::MicroVm("vsock handshake read timeout".into()));
            }
            Err(e) => return Err(RuntimeError::MicroVm(format!("vsock handshake read: {e}"))),
        }
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

/// Send a JSON request and receive a JSON response, both length-prefixed (8-byte big-endian),
/// capping each frame before allocating so a hostile guest cannot drive an out-of-bounds alloc.
fn vsock_json(
    uds_path: &Path,
    port: u32,
    req: &serde_json::Value,
    timeout: Duration,
) -> Result<serde_json::Value> {
    let mut stream = vsock_connect(uds_path, port)?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|e| RuntimeError::MicroVm(format!("set vsock read timeout: {e}")))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| RuntimeError::MicroVm(format!("set vsock write timeout: {e}")))?;

    let req_bytes = serde_json::to_vec(req)?;
    write_frame(&mut stream, &req_bytes, MAX_FRAME_JSON, "exec request")?;
    let resp = read_frame(&mut stream, MAX_FRAME_JSON, "exec response")?;
    Ok(serde_json::from_slice(&resp)?)
}

/// Send a snapshot JSON request and receive a raw tar archive (8-byte big-endian length + bytes).
fn vsock_tar(
    uds_path: &Path,
    port: u32,
    req: &serde_json::Value,
    timeout: Duration,
) -> Result<Vec<u8>> {
    let mut stream = vsock_connect(uds_path, port)?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|e| RuntimeError::MicroVm(format!("set vsock tar read timeout: {e}")))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| RuntimeError::MicroVm(format!("set vsock tar write timeout: {e}")))?;

    let req_bytes = serde_json::to_vec(req)?;
    write_frame(&mut stream, &req_bytes, MAX_FRAME_JSON, "snapshot request")?;
    read_frame(&mut stream, MAX_FRAME_TAR, "snapshot tar")
}

/// Write an 8-byte big-endian length prefix followed by `payload`, refusing to send more than
/// `cap` bytes.
fn write_frame(stream: &mut UnixStream, payload: &[u8], cap: u64, what: &str) -> Result<()> {
    if payload.len() as u64 > cap {
        return Err(RuntimeError::MicroVm(format!(
            "{what} frame {} exceeds cap {cap}",
            payload.len()
        )));
    }
    stream
        .write_all(&(payload.len() as u64).to_be_bytes())
        .map_err(|e| RuntimeError::MicroVm(format!("vsock write {what} length: {e}")))?;
    stream
        .write_all(payload)
        .map_err(|e| RuntimeError::MicroVm(format!("vsock write {what} payload: {e}")))?;
    Ok(())
}

/// Read an 8-byte big-endian length prefix, reject lengths above `cap` *before* allocating, then
/// read exactly that many bytes.
fn read_frame(stream: &mut UnixStream, cap: u64, what: &str) -> Result<Vec<u8>> {
    let mut len_buf = [0u8; 8];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| RuntimeError::MicroVm(format!("vsock read {what} length: {e}")))?;
    let len = u64::from_be_bytes(len_buf);
    if len > cap {
        return Err(RuntimeError::MicroVm(format!(
            "{what} frame length {len} exceeds cap {cap}"
        )));
    }
    let mut payload = vec![0u8; len as usize];
    stream
        .read_exact(&mut payload)
        .map_err(|e| RuntimeError::MicroVm(format!("vsock read {what} payload: {e}")))?;
    Ok(payload)
}

/// Poll until the guest agent accepts a vsock connection or the timeout elapses, surfacing the
/// last connection error in the timeout message.
fn wait_for_agent(uds_path: &Path, port: u32, timeout: Duration) -> Result<()> {
    let start = std::time::Instant::now();
    loop {
        match vsock_connect(uds_path, port) {
            Ok(_) => return Ok(()),
            Err(e) => {
                if start.elapsed() >= timeout {
                    return Err(RuntimeError::MicroVm(format!(
                        "guest agent did not become ready within the timeout (last error: {e})"
                    )));
                }
            }
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

/// Reject a tar entry path component that could escape the destination. Mirrors
/// `reeg_snapshot::tree::validate_name`: a captured name is always a single safe component, so
/// this only bites on a tampered or malicious archive.
fn validate_tar_name(name: &str) -> Result<()> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\0') {
        return Err(RuntimeError::MicroVm(format!(
            "unsafe tar entry name: {name:?}"
        )));
    }
    Ok(())
}

/// Unpack an in-memory tar archive into `dest` entirely in-process (never shelling out to
/// `tar -x`, which a malicious guest could exploit via symlink/`..` traversal to write outside
/// `dest` on the host). Each entry is restricted to regular files and directories with safe,
/// single-component names; symlinks, hardlinks, devices, and any path escape are rejected. The
/// archive's recorded permission bits are preserved so the captured modes are deterministic
/// across tiers and hosts (independent of the host umask).
///
/// Note: rejecting symlinks means a workdir that contains symlinks cannot be checkpointed on the
/// Firecracker tier (the local/OCI tiers, which read the host workdir directly, still can). This
/// is a deliberate safety trade-off for the kernel-boundary tier.
fn unpack_tar(archive: &[u8], dest: &Path) -> Result<()> {
    let mut tar = tar::Archive::new(Cursor::new(archive));
    tar.set_preserve_permissions(true);
    tar.set_overwrite(true);

    for entry in tar
        .entries()
        .map_err(|e| RuntimeError::MicroVm(format!("read tar archive: {e}")))?
    {
        let mut entry = entry.map_err(|e| RuntimeError::MicroVm(format!("read tar entry: {e}")))?;

        match entry.header().entry_type() {
            tar::EntryType::Regular | tar::EntryType::Directory => {}
            tar::EntryType::Symlink | tar::EntryType::Link => {
                return Err(RuntimeError::MicroVm(
                    "tar archive contains a symlink or hardlink (rejected)".into(),
                ));
            }
            other => {
                return Err(RuntimeError::MicroVm(format!(
                    "tar archive contains unsupported entry type {other:?}"
                )));
            }
        }

        let path = entry
            .path()
            .map_err(|e| RuntimeError::MicroVm(format!("read tar entry path: {e}")))?
            .into_owned();
        for component in path.components() {
            match component {
                // `tar -C /work -cf - .` emits entries rooted at "." — that leading CurDir is safe.
                Component::CurDir => {}
                Component::Normal(os) => {
                    let name = os.to_str().ok_or_else(|| {
                        RuntimeError::MicroVm("tar entry has a non-UTF-8 path component".into())
                    })?;
                    validate_tar_name(name)?;
                }
                other => {
                    return Err(RuntimeError::MicroVm(format!(
                        "tar entry has an unsafe path component: {other:?}"
                    )));
                }
            }
        }

        // unpack_in independently refuses to write outside `dest`; combined with the checks above
        // this is defense in depth.
        entry
            .unpack_in(dest)
            .map_err(|e| RuntimeError::MicroVm(format!("unpack tar entry: {e}")))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tar_with<F: FnOnce(&mut tar::Builder<Vec<u8>>)>(build: F) -> Vec<u8> {
        let mut b = tar::Builder::new(Vec::new());
        build(&mut b);
        b.into_inner().unwrap()
    }

    /// Build a single-entry ustar archive with an arbitrary, *unsanitized* name. The high-level
    /// `tar::Builder` refuses to emit a `..` path, but GNU `tar` (what a hostile guest would use)
    /// happily does, so we hand-roll the header to exercise the extractor against real traversal.
    fn raw_tar(name: &str, data: &[u8]) -> Vec<u8> {
        let mut block = [0u8; 512];
        let nb = name.as_bytes();
        block[..nb.len()].copy_from_slice(nb);
        block[100..108].copy_from_slice(b"0000644\0"); // mode
        block[108..116].copy_from_slice(b"0000000\0"); // uid
        block[116..124].copy_from_slice(b"0000000\0"); // gid
        block[124..136].copy_from_slice(format!("{:011o}\0", data.len()).as_bytes()); // size
        block[136..148].copy_from_slice(b"00000000000\0"); // mtime
        block[156] = b'0'; // typeflag: regular file
        block[257..263].copy_from_slice(b"ustar\0");
        block[263..265].copy_from_slice(b"00");
        block[148..156].copy_from_slice(b"        "); // checksum field spaces for the sum
        let sum: u32 = block.iter().map(|&b| b as u32).sum();
        block[148..156].copy_from_slice(format!("{sum:06o}\0 ").as_bytes());

        let mut out = Vec::from(&block[..]);
        out.extend_from_slice(data);
        out.resize(out.len() + (512 - data.len() % 512) % 512, 0); // pad data to 512
        out.resize(out.len() + 1024, 0); // two zero blocks: end of archive
        out
    }

    #[test]
    fn unpack_tar_extracts_safe_entries() {
        let dir = tempfile::tempdir().unwrap();
        let archive = tar_with(|b| {
            let data = b"hello";
            let mut h = tar::Header::new_gnu();
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            h.set_cksum();
            b.append_data(&mut h, "./file.txt", &data[..]).unwrap();
        });
        unpack_tar(&archive, dir.path()).unwrap();
        assert_eq!(
            std::fs::read(dir.path().join("file.txt")).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn unpack_tar_rejects_parent_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let archive = raw_tar("../escape.txt", b"pwned");
        let err = unpack_tar(&archive, dir.path()).unwrap_err();
        assert!(format!("{err}").contains("unsafe"), "got: {err}");
        assert!(!dir.path().parent().unwrap().join("escape.txt").exists());
    }

    #[test]
    fn unpack_tar_rejects_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let archive = tar_with(|b| {
            let mut h = tar::Header::new_gnu();
            h.set_entry_type(tar::EntryType::Symlink);
            h.set_size(0);
            h.set_mode(0o777);
            b.append_link(&mut h, "evil", "/etc/passwd").unwrap();
        });
        let err = unpack_tar(&archive, dir.path()).unwrap_err();
        assert!(format!("{err}").contains("symlink"), "got: {err}");
    }

    #[test]
    fn read_frame_rejects_oversize_length() {
        // A length prefix above the cap must error before any allocation is attempted.
        let (mut a, mut b) = UnixStream::pair().unwrap();
        let huge: u64 = MAX_FRAME_JSON + 1;
        b.write_all(&huge.to_be_bytes()).unwrap();
        let err = read_frame(&mut a, MAX_FRAME_JSON, "exec response").unwrap_err();
        assert!(format!("{err}").contains("exceeds cap"), "got: {err}");
    }
}
