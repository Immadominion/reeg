//! Reeg Nautilus attestation enclave.
//!
//! A tiny AWS Nitro enclave that ATTESTS checkpoints — it does not run the agent. At startup it
//! derives an ed25519 keypair from NSM entropy and obtains a Nitro attestation document that embeds
//! its public key, rooting that key in the enclave's measurements (PCRs). It then answers a minimal
//! vsock protocol from the host:
//!
//!   {"type":"health"}                                            -> {"ok":true}
//!   {"type":"attestation"}                                       -> {"document_hex":..,"public_key_hex":..}
//!   {"type":"sign","machine_id":hex,"seq":N,"manifest_hash":hex} -> {"signature_hex":..,"public_key_hex":..}
//!
//! The enclave reconstructs the FROZEN preimage itself
//! (`REEG_NAUTILUS_ATTEST_V1 ++ machine_id(32) ++ seq(u64 LE) ++ manifest_hash`), so it only ever
//! signs well-formed Reeg attestations — never arbitrary bytes — and that preimage is byte-identical
//! to `reeg::attestation::attestation_preimage` (Move) and `@reeg/crypto`'s `attestationPreimage`.

use std::io::{Read, Write};

use aws_nitro_enclaves_nsm_api::api::{Request as NsmRequest, Response as NsmResponse};
use aws_nitro_enclaves_nsm_api::driver::{nsm_init, nsm_process_request};
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use serde_bytes::ByteBuf;
use vsock::{VsockAddr, VsockListener, VMADDR_CID_ANY};

/// Frozen domain separator — must equal `ATTEST_DOMAIN` in attestation.move and @reeg/crypto.
const ATTEST_DOMAIN: &[u8] = b"REEG_NAUTILUS_ATTEST_V1";
/// vsock port the host connects to. The host passes the enclave CID it ran with.
const PORT: u32 = 5005;
/// Cap on a request frame before allocating (requests are tiny JSON).
const MAX_REQ_FRAME: u64 = 64 * 1024;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Req {
    Health,
    Attestation,
    Sign {
        machine_id: String,
        seq: u64,
        manifest_hash: String,
    },
}

#[derive(Serialize)]
struct Health {
    ok: bool,
}

#[derive(Serialize)]
struct Attestation {
    document_hex: String,
    public_key_hex: String,
}

#[derive(Serialize)]
struct Signed {
    signature_hex: String,
    public_key_hex: String,
}

#[derive(Serialize)]
struct ErrResp {
    error: String,
}

/// State held for the life of the enclave: the signing key and the attestation document that pins
/// its public key. The document is fetched once at startup (the only NSM round trip per boot).
struct Enclave {
    signing_key: SigningKey,
    public_key: [u8; 32],
    attestation_doc: Vec<u8>,
}

impl Enclave {
    fn boot() -> Result<Self, String> {
        let fd = nsm_init();
        if fd < 0 {
            return Err("nsm_init failed (not running inside a Nitro enclave?)".into());
        }
        // Derive the ed25519 key from NSM entropy. GetRandom may return short reads, so accumulate.
        let mut seed = Vec::with_capacity(32);
        while seed.len() < 32 {
            match nsm_process_request(fd, NsmRequest::GetRandom) {
                NsmResponse::GetRandom { random } if !random.is_empty() => seed.extend_from_slice(&random),
                other => return Err(format!("NSM GetRandom failed: {other:?}")),
            }
        }
        let seed: [u8; 32] = seed[..32].try_into().expect("32 bytes");
        let signing_key = SigningKey::from_bytes(&seed);
        let public_key = signing_key.verifying_key().to_bytes();

        // Ask the NSM for an attestation document binding our ed25519 public key. register_enclave
        // on chain extracts public_key from this verified document.
        let attestation_doc = match nsm_process_request(
            fd,
            NsmRequest::Attestation {
                user_data: None,
                nonce: None,
                public_key: Some(ByteBuf::from(public_key.to_vec())),
            },
        ) {
            NsmResponse::Attestation { document } => document,
            other => return Err(format!("NSM Attestation failed: {other:?}")),
        };

        Ok(Enclave {
            signing_key,
            public_key,
            attestation_doc,
        })
    }

    /// The frozen attestation preimage, identical to the Move and TS implementations.
    fn preimage(machine_id: &[u8; 32], seq: u64, manifest_hash: &[u8]) -> Vec<u8> {
        let mut p = Vec::with_capacity(ATTEST_DOMAIN.len() + 32 + 8 + manifest_hash.len());
        p.extend_from_slice(ATTEST_DOMAIN);
        p.extend_from_slice(machine_id);
        p.extend_from_slice(&seq.to_le_bytes());
        p.extend_from_slice(manifest_hash);
        p
    }

    fn handle(&self, req: Req) -> Result<Vec<u8>, String> {
        match req {
            Req::Health => json(&Health { ok: true }),
            Req::Attestation => json(&Attestation {
                document_hex: hex::encode(&self.attestation_doc),
                public_key_hex: hex::encode(self.public_key),
            }),
            Req::Sign {
                machine_id,
                seq,
                manifest_hash,
            } => {
                let id = decode_id(&machine_id)?;
                let manifest = hex::decode(manifest_hash.trim_start_matches("0x"))
                    .map_err(|e| format!("manifest_hash hex: {e}"))?;
                let preimage = Self::preimage(&id, seq, &manifest);
                let sig = self.signing_key.sign(&preimage);
                json(&Signed {
                    signature_hex: hex::encode(sig.to_bytes()),
                    public_key_hex: hex::encode(self.public_key),
                })
            }
        }
    }
}

/// Decode a 32-byte object id from hex (with or without 0x), rejecting any other length so the
/// preimage is always exactly 32 id bytes — matching `object::id_to_bytes` on chain.
fn decode_id(s: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(s.trim_start_matches("0x")).map_err(|e| format!("machine_id hex: {e}"))?;
    bytes
        .as_slice()
        .try_into()
        .map_err(|_| format!("machine_id must be 32 bytes, got {}", bytes.len()))
}

fn json<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|e| format!("serialize: {e}"))
}

fn main() {
    let enclave = match Enclave::boot() {
        Ok(e) => e,
        Err(e) => {
            eprintln!("reeg-enclave: boot failed: {e}");
            std::process::exit(1);
        }
    };
    eprintln!(
        "reeg-enclave: ready on vsock port {PORT}, pubkey {}",
        hex::encode(enclave.public_key)
    );

    let listener = match VsockListener::bind(&VsockAddr::new(VMADDR_CID_ANY, PORT)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("reeg-enclave: bind vsock {PORT} failed: {e}");
            std::process::exit(1);
        }
    };

    for conn in listener.incoming() {
        match conn {
            Ok(mut stream) => {
                if let Err(e) = serve(&enclave, &mut stream) {
                    let _ = write_frame(&mut stream, &json(&ErrResp { error: e }).unwrap_or_default());
                }
            }
            Err(e) => eprintln!("reeg-enclave: accept error: {e}"),
        }
    }
}

/// One request/response per connection, length-prefixed JSON (8-byte big-endian length).
fn serve(enclave: &Enclave, stream: &mut vsock::VsockStream) -> Result<(), String> {
    let req_bytes = read_frame(stream)?;
    let req: Req = serde_json::from_slice(&req_bytes).map_err(|e| format!("parse request: {e}"))?;
    let resp = enclave.handle(req)?;
    write_frame(stream, &resp).map_err(|e| format!("write response: {e}"))
}

fn read_frame(stream: &mut vsock::VsockStream) -> Result<Vec<u8>, String> {
    let mut len = [0u8; 8];
    stream.read_exact(&mut len).map_err(|e| format!("read length: {e}"))?;
    let n = u64::from_be_bytes(len);
    if n > MAX_REQ_FRAME {
        return Err(format!("request frame {n} exceeds cap {MAX_REQ_FRAME}"));
    }
    let mut buf = vec![0u8; n as usize];
    stream.read_exact(&mut buf).map_err(|e| format!("read payload: {e}"))?;
    Ok(buf)
}

fn write_frame(stream: &mut vsock::VsockStream, payload: &[u8]) -> std::io::Result<()> {
    stream.write_all(&(payload.len() as u64).to_be_bytes())?;
    stream.write_all(payload)?;
    stream.flush()
}
