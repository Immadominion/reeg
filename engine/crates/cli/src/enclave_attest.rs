//! Client for the local Nautilus attestation enclave (Linux only; vsock is a Linux interface).
//!
//! The agent runs in the Firecracker microVM; a separate Nitro enclave on the same host signs
//! checkpoint manifests. This connects to that enclave over vsock and speaks its length-prefixed
//! JSON protocol (see enclave/README.md): fetch the attestation document (to register the enclave on
//! chain once) and sign a checkpoint's frozen preimage (per attested checkpoint). The enclave builds
//! the preimage itself, so this only passes the machine id, sequence, and manifest hash.

use std::io::{Read, Write};
use std::time::Duration;

use anyhow::{Context, Result};
use vsock::{VsockAddr, VsockStream};

/// Cap on a response frame before allocating (an attestation document is a few KiB).
const MAX_FRAME: u64 = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

/// Fetch the enclave's Nitro attestation document (hex). Register it on chain once per enclave
/// build with `reeg enclave register`.
pub fn fetch_document(cid: u32, port: u32) -> Result<String> {
    let resp = call(cid, port, &serde_json::json!({ "type": "attestation" }))?;
    field(&resp, "document_hex")
}

/// Ask the enclave to sign a checkpoint's frozen preimage, returning the ed25519 signature and the
/// enclave's public key (both hex), so the caller can verify the signature locally.
pub fn sign(
    cid: u32,
    port: u32,
    machine_id: &str,
    seq: u64,
    manifest_hash: &str,
) -> Result<(String, String)> {
    let resp = call(
        cid,
        port,
        &serde_json::json!({
            "type": "sign",
            "machine_id": machine_id,
            "seq": seq,
            "manifest_hash": manifest_hash,
        }),
    )?;
    Ok((
        field(&resp, "signature_hex")?,
        field(&resp, "public_key_hex")?,
    ))
}

fn field(resp: &serde_json::Value, key: &str) -> Result<String> {
    if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        anyhow::bail!("enclave error: {err}");
    }
    resp.get(key)
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .with_context(|| format!("enclave response missing {key}"))
}

/// One request/response over vsock, framed with an 8-byte big-endian length prefix.
fn call(cid: u32, port: u32, req: &serde_json::Value) -> Result<serde_json::Value> {
    let mut stream = VsockStream::connect(&VsockAddr::new(cid, port))
        .with_context(|| format!("connect to enclave vsock {cid}:{port}"))?;
    stream.set_read_timeout(Some(TIMEOUT)).ok();
    stream.set_write_timeout(Some(TIMEOUT)).ok();

    let body = serde_json::to_vec(req)?;
    stream.write_all(&(body.len() as u64).to_be_bytes())?;
    stream.write_all(&body)?;
    stream.flush()?;

    let mut len = [0u8; 8];
    stream
        .read_exact(&mut len)
        .context("read response length")?;
    let n = u64::from_be_bytes(len);
    if n > MAX_FRAME {
        anyhow::bail!("enclave response frame {n} exceeds cap {MAX_FRAME}");
    }
    let mut buf = vec![0u8; n as usize];
    stream
        .read_exact(&mut buf)
        .context("read response payload")?;
    Ok(serde_json::from_slice(&buf)?)
}
