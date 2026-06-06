//! In-guest agent for the Firecracker microVM tier. Run as `reeg-engine guest-agent` inside
//! the VM; the host `FirecrackerRuntime` connects over vsock to exec commands and pull the
//! working directory at checkpoint time. Linux only; built into the rootfs image.
//!
//! Protocol: each connection carries one request (length-prefixed JSON) and one response.
//! - exec:     request  `{"type":"exec","program":"...","args":[...],"cwd":"/work"}`
//!             response `{"exit_code":0,"stdout_hex":"...","stderr_hex":""}` (length-prefixed JSON)
//! - snapshot: request  `{"type":"snapshot"}`
//!             response 4-byte big-endian tar length + raw tar bytes of `/work`

use std::io::{Read, Write};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

const WORKDIR: &str = "/work";
/// VMADDR_CID_ANY: accept connections on any guest CID (the VM has exactly one).
const VMADDR_CID_ANY: u32 = u32::MAX;

pub fn run(port: u32) -> Result<()> {
    // Ensure the working directory exists so agents always have a place to write.
    std::fs::create_dir_all(WORKDIR).context("create /work")?;

    let addr = vsock::VsockAddr::new(VMADDR_CID_ANY, port);
    let listener = vsock::VsockListener::bind(&addr)
        .with_context(|| format!("bind vsock port {port}"))?;

    eprintln!("reeg guest-agent: ready on vsock port {port}");

    for conn in listener.incoming() {
        match conn {
            Ok(mut stream) => {
                if let Err(e) = handle(&mut stream) {
                    eprintln!("guest-agent connection error: {e:#}");
                }
            }
            Err(e) => eprintln!("guest-agent accept error: {e}"),
        }
    }
    Ok(())
}

fn handle(stream: &mut vsock::VsockStream) -> Result<()> {
    // Read request: 4-byte big-endian length prefix + JSON payload.
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).context("read request length")?;
    let req_len = u32::from_be_bytes(len_buf) as usize;
    let mut req_bytes = vec![0u8; req_len];
    stream.read_exact(&mut req_bytes).context("read request payload")?;

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
    stream.write_all(&(resp_bytes.len() as u32).to_be_bytes()).context("write response length")?;
    stream.write_all(&resp_bytes).context("write response payload")?;
    Ok(())
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
        anyhow::bail!(
            "tar failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    // Length-prefix the raw tar bytes so the host can pre-allocate and read exactly.
    let tar = &output.stdout;
    stream.write_all(&(tar.len() as u32).to_be_bytes()).context("write tar length")?;
    stream.write_all(tar).context("write tar bytes")?;
    Ok(())
}
