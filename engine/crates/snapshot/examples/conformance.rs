//! Emit a conformance fixture for the cross-language manifest contract. The TypeScript
//! verifier (@reeg/verify) must reproduce these exact canonical bytes and hash; if the two
//! encoders ever diverge, the fixture test on either side fails. Run with:
//!
//!   cargo run -p reeg-snapshot --example conformance
//!
//! The output is committed at packages/verify/fixtures/manifest.json.

use std::collections::BTreeMap;

use reeg_snapshot::{ContentHash, EnvironmentInputs, Manifest, Package};

fn main() {
    // A deliberately unsorted, ASCII-only input so the fixture exercises normalization
    // (sorting, dedup) without touching the non-ASCII ordering edge.
    let mut env = BTreeMap::new();
    env.insert("PATH".to_string(), "/usr/bin".to_string());
    env.insert("LANG".to_string(), "en".to_string());

    let inputs = EnvironmentInputs {
        packages: vec![
            Package {
                name: "rust".into(),
                version: "1.95".into(),
            },
            Package {
                name: "node".into(),
                version: "24".into(),
            },
        ],
        env,
        tools: vec!["ripgrep".into(), "git".into(), "git".into()],
        memory_pointer: None,
    };

    let workdir_root_hash = ContentHash::of(b"reeg-conformance-root");
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
