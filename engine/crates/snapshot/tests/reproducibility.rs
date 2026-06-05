//! Phase B done-bar, as executable acceptance tests: on a single host, checkpoint then
//! restore produces a byte-identical working directory with zero drift, and the same input
//! always yields the same hashes. Drift and unsupported state are surfaced, never hidden.

use std::collections::BTreeMap;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use reeg_snapshot::{
    CasStore, EnvironmentInputs, Package, SnapshotError, checkpoint, drift, restore,
};
use tempfile::tempdir;

/// A small but representative tree: nested dirs, a normal file, an executable, an empty
/// directory, and a symlink. This is the "clean, file-based state" phase B supports.
fn build_sample(root: &Path) {
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("README.md"), b"# reeg\n").unwrap();
    fs::write(root.join("src/main.rs"), b"fn main() {}\n").unwrap();

    let script = root.join("run.sh");
    fs::write(&script, b"#!/bin/sh\necho hi\n").unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();

    fs::create_dir_all(root.join("empty")).unwrap();
    std::os::unix::fs::symlink("README.md", root.join("link-to-readme")).unwrap();
}

fn sample_inputs() -> EnvironmentInputs {
    let mut env = BTreeMap::new();
    env.insert("PATH".to_string(), "/usr/bin".to_string());
    env.insert("API_TOKEN".to_string(), "do-not-store".to_string());
    EnvironmentInputs {
        packages: vec![Package {
            name: "ripgrep".into(),
            version: "14".into(),
        }],
        env,
        tools: vec!["git".into()],
        memory_pointer: None,
    }
}

#[test]
fn checkpoint_is_deterministic() {
    let work = tempdir().unwrap();
    let store = tempdir().unwrap();
    build_sample(work.path());
    let cas = CasStore::open(store.path()).unwrap();

    let first = checkpoint(work.path(), &cas, sample_inputs()).unwrap();
    let second = checkpoint(work.path(), &cas, sample_inputs()).unwrap();

    assert_eq!(first.workdir_root_hash, second.workdir_root_hash);
    assert_eq!(
        first.manifest_hash().unwrap(),
        second.manifest_hash().unwrap()
    );
}

#[test]
fn restore_is_byte_identical_with_zero_drift() {
    let work = tempdir().unwrap();
    let store = tempdir().unwrap();
    let dest = tempdir().unwrap();
    build_sample(work.path());
    let cas = CasStore::open(store.path()).unwrap();

    let manifest = checkpoint(work.path(), &cas, sample_inputs()).unwrap();
    restore(&manifest, &cas, dest.path()).unwrap();

    let report = drift(&manifest, &cas, dest.path()).unwrap();
    assert!(
        report.is_clean(),
        "unexpected drift: {:?}",
        report.differences
    );

    // Spot-check the things restore must preserve: content, the executable bit, the symlink.
    assert_eq!(
        fs::read(dest.path().join("src/main.rs")).unwrap(),
        b"fn main() {}\n"
    );
    let mode = fs::symlink_metadata(dest.path().join("run.sh"))
        .unwrap()
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o755);
    assert_eq!(
        fs::read_link(dest.path().join("link-to-readme")).unwrap(),
        Path::new("README.md")
    );
}

#[test]
fn secret_value_never_reaches_the_manifest() {
    let work = tempdir().unwrap();
    let store = tempdir().unwrap();
    build_sample(work.path());
    let cas = CasStore::open(store.path()).unwrap();

    let manifest = checkpoint(work.path(), &cas, sample_inputs()).unwrap();
    let json = String::from_utf8(manifest.canonical_bytes().unwrap()).unwrap();
    assert!(
        !json.contains("do-not-store"),
        "secret leaked into manifest"
    );
    assert_eq!(manifest.env.get("API_TOKEN").unwrap(), "<redacted>");
}

#[test]
fn drift_names_a_modified_file() {
    let work = tempdir().unwrap();
    let store = tempdir().unwrap();
    let dest = tempdir().unwrap();
    build_sample(work.path());
    let cas = CasStore::open(store.path()).unwrap();

    let manifest = checkpoint(work.path(), &cas, sample_inputs()).unwrap();
    restore(&manifest, &cas, dest.path()).unwrap();
    fs::write(dest.path().join("src/main.rs"), b"tampered\n").unwrap();

    let report = drift(&manifest, &cas, dest.path()).unwrap();
    assert!(!report.is_clean());
    assert!(
        report
            .differences
            .contains(&"changed: src/main.rs".to_string()),
        "expected a named change, got {:?}",
        report.differences
    );
}

#[test]
fn unsupported_file_type_is_rejected() {
    let work = tempdir().unwrap();
    let store = tempdir().unwrap();
    let cas = CasStore::open(store.path()).unwrap();

    // A unix socket is neither file, dir, nor symlink; capture must refuse it rather than
    // produce a checkpoint that cannot be restored.
    let _listener = std::os::unix::net::UnixListener::bind(work.path().join("agent.sock")).unwrap();

    let result = checkpoint(work.path(), &cas, sample_inputs());
    assert!(matches!(result, Err(SnapshotError::UnsupportedFileType(_))));
}
