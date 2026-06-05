use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::cas::CasStore;
use crate::error::{Result, SnapshotError};
use crate::hash::ContentHash;
use crate::manifest::{EnvironmentInputs, Manifest};

/// Bundle format version. Bumped only for an incompatible change to the framing.
pub const BUNDLE_SCHEMA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct BundleObject {
    hash: String,
    data: String,
}

#[derive(Serialize, Deserialize)]
struct Bundle {
    schema_version: u32,
    manifest: Manifest,
    objects: Vec<BundleObject>,
}

/// Pack a working directory, and optionally an agent memory directory, into a single
/// self-contained checkpoint bundle: the manifest plus every content-addressed object reachable
/// from it, serialized deterministically. This is the artifact the client encrypts and stores; it
/// carries no local paths, so it restores anywhere.
///
/// When a memory directory is given it is captured into the same store, so memory travels inside
/// the bundle and restores on any host with no memory service. Its content hash becomes the
/// manifest's `memory_pointer`, so memory is verified with the environment (the pointer is part of
/// `manifest_hash`). When it is absent, `inputs.memory_pointer` is left as supplied, and the
/// filesystem-and-environment story stands on its own. The `scratch` store is a throwaway used
/// only to capture into; the returned bytes are what matter.
pub fn pack(
    workdir: &Path,
    memory: Option<&Path>,
    scratch: &CasStore,
    mut inputs: EnvironmentInputs,
) -> Result<(Vec<u8>, Manifest)> {
    if let Some(memory_dir) = memory {
        let memory_root = crate::tree::capture(memory_dir, scratch)?;
        inputs.memory_pointer = Some(memory_root.to_hex());
    }
    let manifest = crate::checkpoint(workdir, scratch, inputs)?;
    let objects = scratch
        .read_all()?
        .into_iter()
        .map(|(hash, data)| BundleObject {
            hash: hash.to_hex(),
            data: hex::encode(data),
        })
        .collect();
    let bundle = Bundle {
        schema_version: BUNDLE_SCHEMA_VERSION,
        manifest: manifest.clone(),
        objects,
    };
    Ok((serde_json::to_vec(&bundle)?, manifest))
}

/// Unpack a bundle and rebuild its working directory under `dest`, byte for byte, and, if a
/// `memory_dest` is given and the manifest carries an engine-captured (content-hash) memory
/// pointer, rebuild the memory directory there too. Each object is re-verified against its hash as
/// it is loaded into `scratch`, so a tampered bundle is rejected. A non-content-hash pointer (an
/// external memory-service reference) is left to that service; the filesystem restore stands
/// regardless. Returns the manifest the bundle carried.
pub fn unpack(
    bundle_bytes: &[u8],
    scratch: &CasStore,
    dest: &Path,
    memory_dest: Option<&Path>,
) -> Result<Manifest> {
    let bundle: Bundle = serde_json::from_slice(bundle_bytes)?;
    if bundle.schema_version != BUNDLE_SCHEMA_VERSION {
        return Err(SnapshotError::Bundle(format!(
            "unsupported bundle schema {}",
            bundle.schema_version
        )));
    }
    for object in &bundle.objects {
        let data = hex::decode(&object.data)
            .map_err(|_| SnapshotError::Bundle(format!("object {} has non-hex data", object.hash)))?;
        let stored = scratch.put(&data)?;
        if stored.to_hex() != object.hash {
            return Err(SnapshotError::CorruptObject {
                requested: object.hash.clone(),
                actual: stored.to_hex(),
            });
        }
    }
    crate::restore(&bundle.manifest, scratch, dest)?;
    if let Some(memory_dir) = memory_dest {
        if let Some(pointer) = &bundle.manifest.memory_pointer {
            if let Ok(memory_root) = ContentHash::from_hex(pointer) {
                crate::tree::restore(&memory_root, scratch, memory_dir)?;
            }
        }
    }
    Ok(bundle.manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sample(dir: &Path) {
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/main.rs"), b"fn main() {}").unwrap();
        fs::write(dir.join("README"), b"hello reeg").unwrap();
    }

    #[test]
    fn pack_then_unpack_is_byte_identical() {
        let work = tempfile::tempdir().unwrap();
        let packdir = tempfile::tempdir().unwrap();
        let unpackdir = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        sample(work.path());

        let pack_cas = CasStore::open(packdir.path()).unwrap();
        let (bundle, manifest) =
            pack(work.path(), None, &pack_cas, EnvironmentInputs::default()).unwrap();

        let unpack_cas = CasStore::open(unpackdir.path()).unwrap();
        let restored = unpack(&bundle, &unpack_cas, dest.path(), None).unwrap();

        assert_eq!(manifest.workdir_root_hash, restored.workdir_root_hash);
        assert!(crate::drift(&restored, &unpack_cas, dest.path()).unwrap().is_clean());
        assert_eq!(fs::read(dest.path().join("src/main.rs")).unwrap(), b"fn main() {}");
    }

    #[test]
    fn pack_is_deterministic() {
        let work = tempfile::tempdir().unwrap();
        let dir_a = tempfile::tempdir().unwrap();
        let dir_b = tempfile::tempdir().unwrap();
        sample(work.path());
        let a = CasStore::open(dir_a.path()).unwrap();
        let b = CasStore::open(dir_b.path()).unwrap();
        let (bundle_a, _) = pack(work.path(), None, &a, EnvironmentInputs::default()).unwrap();
        let (bundle_b, _) = pack(work.path(), None, &b, EnvironmentInputs::default()).unwrap();
        assert_eq!(bundle_a, bundle_b);
    }

    #[test]
    fn a_tampered_bundle_is_rejected() {
        let work = tempfile::tempdir().unwrap();
        let pack_dir = tempfile::tempdir().unwrap();
        let out_dir = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        sample(work.path());
        let cas = CasStore::open(pack_dir.path()).unwrap();
        let (bundle, _) = pack(work.path(), None, &cas, EnvironmentInputs::default()).unwrap();

        // Flip a byte inside the hex-encoded object data; unpack must reject it.
        let mut text = String::from_utf8(bundle).unwrap();
        let hexed = hex::encode("fn main".as_bytes());
        let pos = text.find(&hexed).expect("file content present in bundle");
        text.replace_range(pos..pos + 2, "ff");

        let out = CasStore::open(out_dir.path()).unwrap();
        assert!(unpack(text.as_bytes(), &out, dest.path(), None).is_err());
    }

    #[test]
    fn memory_is_captured_restored_and_bound_into_the_manifest() {
        let work = tempfile::tempdir().unwrap();
        let memory = tempfile::tempdir().unwrap();
        let packdir = tempfile::tempdir().unwrap();
        let unpackdir = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let mem_dest = tempfile::tempdir().unwrap();
        sample(work.path());
        fs::create_dir_all(memory.path().join("vectors")).unwrap();
        fs::write(memory.path().join("vectors/index.bin"), b"semantic-memory-state").unwrap();

        let pack_cas = CasStore::open(packdir.path()).unwrap();
        let (bundle, manifest) =
            pack(work.path(), Some(memory.path()), &pack_cas, EnvironmentInputs::default()).unwrap();
        // The memory pointer is the captured content hash, so it is part of manifest_hash.
        assert!(manifest.memory_pointer.is_some());

        let unpack_cas = CasStore::open(unpackdir.path()).unwrap();
        let restored =
            unpack(&bundle, &unpack_cas, dest.path(), Some(mem_dest.path())).unwrap();
        assert_eq!(manifest.memory_pointer, restored.memory_pointer);
        // Memory survived the round trip byte for byte, alongside the working directory.
        assert_eq!(
            fs::read(mem_dest.path().join("vectors/index.bin")).unwrap(),
            b"semantic-memory-state"
        );
        assert_eq!(fs::read(dest.path().join("README")).unwrap(), b"hello reeg");
    }

    #[test]
    fn no_memory_dir_leaves_the_pointer_unset_and_filesystem_intact() {
        let work = tempfile::tempdir().unwrap();
        let packdir = tempfile::tempdir().unwrap();
        let unpackdir = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        sample(work.path());

        let pack_cas = CasStore::open(packdir.path()).unwrap();
        let (bundle, manifest) =
            pack(work.path(), None, &pack_cas, EnvironmentInputs::default()).unwrap();
        assert!(manifest.memory_pointer.is_none());

        // Restoring without a memory dest still rebuilds the working directory.
        let unpack_cas = CasStore::open(unpackdir.path()).unwrap();
        unpack(&bundle, &unpack_cas, dest.path(), None).unwrap();
        assert_eq!(fs::read(dest.path().join("src/main.rs")).unwrap(), b"fn main() {}");
    }
}
