//! reeg-snapshot: manifest, content hashing, deltas, and byte-exact restore.
//!
//! This crate knows nothing about chains or storage networks. It produces and consumes
//! content-addressed artifacts (a manifest plus objects keyed by BLAKE3), so it stays
//! unit-testable in isolation and the TypeScript client can encrypt, store, and anchor them
//! across the artifact boundary. The exact encoding is the frozen contract in
//! `docs/03-engineering/manifest-spec.md`; the whole product's trust rests on it, so
//! determinism (no timestamps, uid/gid, or iteration-order leakage) is enforced here.

mod bundle;
mod cas;
mod error;
mod hash;
mod manifest;
mod tree;

use std::path::Path;

pub use bundle::{BUNDLE_SCHEMA_VERSION, pack, unpack};
pub use cas::CasStore;
pub use error::{Result, SnapshotError};
pub use hash::ContentHash;
pub use manifest::{EnvironmentInputs, Manifest, Package, REDACTED, SCHEMA_VERSION};
pub use tree::{DirNode, DriftReport, Entry};

/// Capture a working directory into the store and build the checkpoint manifest. No chain,
/// storage, or encryption is involved; that is the client's job across the artifact boundary.
pub fn checkpoint(workdir: &Path, cas: &CasStore, inputs: EnvironmentInputs) -> Result<Manifest> {
    let workdir_root_hash = tree::capture(workdir, cas)?;
    Ok(Manifest::new(inputs, workdir_root_hash))
}

/// Rebuild a checkpoint's working directory under `dest`, byte for byte.
pub fn restore(manifest: &Manifest, cas: &CasStore, dest: &Path) -> Result<()> {
    tree::restore(&manifest.workdir_root_hash, cas, dest)
}

/// Re-capture `dest` and report whether it matches the manifest, naming any drift.
pub fn drift(manifest: &Manifest, cas: &CasStore, dest: &Path) -> Result<DriftReport> {
    tree::drift(&manifest.workdir_root_hash, cas, dest)
}
