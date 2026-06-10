//! In-guest agent for the Firecracker microVM tier. Run as `reeg-engine guest-agent` inside
//! the VM; the host `FirecrackerRuntime` connects over vsock to exec commands and pull the
//! working directory at checkpoint time. Linux only; built into the rootfs image.
//!
//! Protocol: each connection carries one request (length-prefixed JSON) and one response.
//! - exec: request `{"type":"exec","program":"...","args":[...],"cwd":"/work"}`, response
//!   `{"exit_code":0,"stdout_hex":"...","stderr_hex":""}` (length-prefixed JSON).
//! - snapshot: request `{"type":"snapshot"}`, response 8-byte big-endian tar length + tar bytes.
//!
//! Framing: every frame carries an 8-byte big-endian length prefix (u64) so a `/work` larger than
//! 4 GiB cannot be silently truncated, and each frame is checked against a cap before allocating.
//! Robustness: each connection gets a read timeout so one hung exec cannot wedge the
//! single-threaded control plane forever.

use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

use anyhow::{Context, Result};

const WORKDIR: &str = "/work";
/// VMADDR_CID_ANY: accept connections on any guest CID (the VM has exactly one).
const VMADDR_CID_ANY: u32 = u32::MAX;

/// Cap on an incoming request frame, checked before allocating. The guest has only 512 MiB, so a
/// hostile/buggy host must not be able to make it allocate gigabytes (#19). Requests are tiny
/// (an exec command line or a snapshot trigger), so 64 KiB is generous.
const MAX_REQ_FRAME: u64 = 64 * 1024;
/// Cap on the exec response frame (JSON with hex-encoded stdout/stderr). Matches the host's
/// `MAX_FRAME_JSON`.
const MAX_EXEC_FRAME: u64 = 8 * 1024 * 1024;
/// Cap on the snapshot tar frame. Matches the host's `MAX_FRAME_TAR`; the u64 prefix removes the
/// old silent >4 GiB truncation.
const MAX_TAR_FRAME: u64 = 8 * 1024 * 1024 * 1024;

/// Per-connection read timeout: if the host sends no request bytes for this long, drop the
/// connection instead of blocking the single-threaded accept loop forever (#10). This bounds how
/// long we wait for *request bytes*, not how long a command may run.
const READ_TIMEOUT: Duration = Duration::from_secs(30);

pub fn run(port: u32) -> Result<()> {
    // Pin the canonical umask up front so files the agent creates get deterministic modes,
    // independent of whatever umask the guest init happened to inherit. This is what keeps
    // workdir_root_hash identical to the host tiers (see reeg_runtime::umask).
    reeg_runtime::apply_canonical_umask();

    // Start each session with an empty /work. /work is a per-session tmpfs the init script mounts,
    // so it is normally already empty; clear its *contents* defensively rather than removing the
    // directory itself, which would fail with EBUSY on the tmpfs mountpoint.
    clear_dir_contents(WORKDIR).context("clear /work")?;

    let addr = vsock::VsockAddr::new(VMADDR_CID_ANY, port);
    let listener =
        vsock::VsockListener::bind(&addr).with_context(|| format!("bind vsock port {port}"))?;

    eprintln!("reeg guest-agent: ready on vsock port {port}");

    for conn in listener.incoming() {
        match conn {
            Ok(mut stream) => {
                // Bound how long we wait for request bytes so a stalled connection can't wedge the
                // single-threaded loop; on failure just drop this connection.
                if let Err(e) = stream.set_read_timeout(Some(READ_TIMEOUT)) {
                    eprintln!("guest-agent set_read_timeout failed: {e}");
                    continue;
                }
                if let Err(e) = handle(&mut stream) {
                    eprintln!("guest-agent connection error: {e:#}");
                }
            }
            Err(e) => eprintln!("guest-agent accept error: {e}"),
        }
    }
    Ok(())
}

/// Remove every entry inside `dir` (creating `dir` if absent), without removing `dir` itself —
/// `dir` is a tmpfs mountpoint, so `remove_dir_all(dir)` would fail trying to rmdir the mount root.
fn clear_dir_contents(dir: &str) -> Result<()> {
    let path = std::path::Path::new(dir);
    if !path.exists() {
        std::fs::create_dir_all(path)?;
        return Ok(());
    }
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let p = entry.path();
        if entry.file_type()?.is_dir() {
            std::fs::remove_dir_all(&p)?;
        } else {
            std::fs::remove_file(&p)?;
        }
    }
    Ok(())
}

fn handle(stream: &mut vsock::VsockStream) -> Result<()> {
    // Read request: 8-byte big-endian length prefix + JSON payload. Cap the length before
    // allocating so a bogus prefix cannot OOM the guest (#19).
    let mut len_buf = [0u8; 8];
    stream
        .read_exact(&mut len_buf)
        .context("read request length")?;
    let req_len = u64::from_be_bytes(len_buf);
    if req_len > MAX_REQ_FRAME {
        anyhow::bail!("request frame {req_len} exceeds cap {MAX_REQ_FRAME}");
    }

    let mut req_bytes = vec![0u8; req_len as usize];
    stream
        .read_exact(&mut req_bytes)
        .context("read request payload")?;

    let req: serde_json::Value = serde_json::from_slice(&req_bytes).context("parse request")?;
    match req["type"].as_str() {
        Some("exec") => handle_exec(stream, &req),
        Some("snapshot") => handle_snapshot(stream),
        other => anyhow::bail!("unknown request type: {other:?}"),
    }
}

fn handle_exec(stream: &mut vsock::VsockStream, req: &serde_json::Value) -> Result<()> {
    let program = req["program"].as_str().unwrap_or("sh");
    let args: Vec<&str> = req["args"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    let cwd = req["cwd"].as_str().unwrap_or(WORKDIR);

    let output = Command::new(program)
        .args(&args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("launch {program}"))?;

    let resp = serde_json::json!({
        "exit_code": output.status.code().unwrap_or(-1),
        "stdout_hex": hex::encode(&output.stdout),
        "stderr_hex": hex::encode(&output.stderr),
    });
    let resp_bytes = serde_json::to_vec(&resp).context("serialize exec response")?;
    write_frame(stream, &resp_bytes, MAX_EXEC_FRAME, "exec response")
}

fn handle_snapshot(stream: &mut vsock::VsockStream) -> Result<()> {
    // Produce a tar archive of the working directory and stream it to the host runtime.
    let output = Command::new("tar")
        .args(["-C", WORKDIR, "-cf", "-", "."])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .context("run tar")?;

    if !output.status.success() {
        anyhow::bail!("tar failed: {}", String::from_utf8_lossy(&output.stderr));
    }
    write_frame(stream, &output.stdout, MAX_TAR_FRAME, "snapshot tar")
}

/// Write an 8-byte big-endian length prefix followed by `payload`, refusing to send more than
/// `cap` bytes. Mirrors the host's framing in `firecracker.rs`.
fn write_frame(
    stream: &mut vsock::VsockStream,
    payload: &[u8],
    cap: u64,
    what: &str,
) -> Result<()> {
    if payload.len() as u64 > cap {
        anyhow::bail!("{what} frame {} exceeds cap {cap}", payload.len());
    }
    stream
        .write_all(&(payload.len() as u64).to_be_bytes())
        .with_context(|| format!("write {what} length"))?;
    stream
        .write_all(payload)
        .with_context(|| format!("write {what} payload"))?;
    Ok(())
}
