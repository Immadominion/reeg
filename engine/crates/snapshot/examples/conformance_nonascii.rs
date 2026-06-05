//! A second conformance fixture using non-ASCII keys/tools whose UTF-16 and UTF-8 sort orders
//! differ (U+E000 vs U+10000). It proves the TS verifier's compareUtf8 reproduces Rust's
//! byte-wise String ordering; a naive JS sort would order these the other way and diverge.
//! Run with: cargo run -p reeg-snapshot --example conformance_nonascii
//! Output is committed at packages/verify/fixtures/manifest-nonascii.json.

use std::collections::BTreeMap;

use reeg_snapshot::{ContentHash, EnvironmentInputs, Manifest, Package};

fn main() {
    // U+E000 (UTF-8 0xEE..) sorts before U+10000 (UTF-8 0xF0..) by bytes, but after it by
    // UTF-16 code units (0xE000 vs the 0xD800 surrogate). Rust uses byte order.
    let low = "\u{E000}".to_string();
    let high = "\u{10000}".to_string();

    let mut env = BTreeMap::new();
    env.insert(high.clone(), "h".to_string());
    env.insert(low.clone(), "l".to_string());

    let inputs = EnvironmentInputs {
        packages: vec![
            Package {
                name: high.clone(),
                version: "1".into(),
            },
            Package {
                name: low.clone(),
                version: "1".into(),
            },
        ],
        env,
        tools: vec![high.clone(), low.clone()],
        memory_pointer: None,
    };

    let workdir_root_hash = ContentHash::of(b"reeg-nonascii-root");
    let manifest = Manifest::new(inputs, workdir_root_hash);
    let bytes = manifest.canonical_bytes().expect("canonical encoding");
    let hash = manifest.manifest_hash().expect("manifest hash");

    println!(
        "{{\"manifestBytesHex\":\"{}\",\"manifestHashHex\":\"{}\",\"workdirRootHashHex\":\"{}\"}}",
        hex::encode(&bytes),
        hash.to_hex(),
        workdir_root_hash.to_hex()
    );
}
