//! Phase C done-bar as an executable test: an agent runs commands and reads/writes files inside
//! a Machine through the adapter, and a checkpoint taken mid-session restores to a byte-identical
//! working directory on a host that never saw the original.

use reeg_runtime::{
    CasStore, EnvironmentInputs, ExecRequest, LocalRuntime, Runtime, drift, restore,
};
use tempfile::tempdir;

fn sh(script: &str) -> ExecRequest {
    ExecRequest::new("sh", ["-c", script])
}

#[test]
fn agent_session_checkpoints_and_restores_on_a_fresh_host() {
    let store = tempdir().unwrap();
    let cas = CasStore::open(store.path()).unwrap();
    let work = tempdir().unwrap();
    let mut rt = LocalRuntime::create(work.path().join("machine")).unwrap();

    // The agent does real work across several commands.
    rt.exec(&sh("mkdir -p src tests")).unwrap();
    rt.exec(&sh("printf 'fn main() {}' > src/main.rs")).unwrap();
    rt.exec(&sh("printf 'ok' > tests/smoke")).unwrap();
    assert_eq!(rt.event_log().len(), 3);

    // Checkpoint mid-session; the host could now die.
    let manifest = rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();

    // Restore on a host that never saw the original; it must be byte-identical.
    let fresh = tempdir().unwrap();
    restore(&manifest, &cas, fresh.path()).unwrap();
    assert!(
        drift(&manifest, &cas, fresh.path()).unwrap().is_clean(),
        "restore drifted from the checkpoint"
    );
    assert_eq!(
        std::fs::read(fresh.path().join("src/main.rs")).unwrap(),
        b"fn main() {}"
    );

    // The session continues; a later checkpoint reflects the change.
    rt.exec(&sh("printf ' // edited' >> src/main.rs")).unwrap();
    let manifest2 = rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();
    assert_ne!(manifest.workdir_root_hash, manifest2.workdir_root_hash);
}
