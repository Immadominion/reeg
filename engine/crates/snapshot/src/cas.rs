use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Result, SnapshotError, io_at};
use crate::hash::ContentHash;

/// A content-addressed object store on disk. Objects are named by the BLAKE3 hash of their
/// bytes, so identical content is stored once (dedup) and any object can be verified
/// against its own name on read. This is the only place checkpoint bytes are written.
pub struct CasStore {
    objects_dir: PathBuf,
}

impl CasStore {
    /// Open (creating if needed) a store rooted at `root`. Objects live under `root/objects`,
    /// sharded by the first two hex characters to keep directories small.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self> {
        let objects_dir = root.into().join("objects");
        fs::create_dir_all(&objects_dir).map_err(|e| io_at(&objects_dir, e))?;
        Ok(CasStore { objects_dir })
    }

    /// Store `bytes` and return their hash. Writing the same bytes again is a no-op, because
    /// the object already exists under the same name.
    pub fn put(&self, bytes: &[u8]) -> Result<ContentHash> {
        let hash = ContentHash::of(bytes);
        let final_path = self.path_for(&hash);
        if final_path.exists() {
            return Ok(hash);
        }
        let shard = final_path
            .parent()
            .expect("object path always has a shard parent");
        fs::create_dir_all(shard).map_err(|e| io_at(shard, e))?;

        // Write to a temp name unique to this content, then rename, so a reader never sees a
        // half-written object and two writers of the same bytes cannot corrupt each other.
        let tmp_path = shard.join(format!(".tmp-{}", hash.to_hex()));
        fs::write(&tmp_path, bytes).map_err(|e| io_at(&tmp_path, e))?;
        fs::rename(&tmp_path, &final_path).map_err(|e| io_at(&final_path, e))?;
        Ok(hash)
    }

    /// Read an object and verify its bytes hash to the requested name before returning them.
    pub fn get(&self, hash: &ContentHash) -> Result<Vec<u8>> {
        let path = self.path_for(hash);
        if !path.exists() {
            return Err(SnapshotError::ObjectNotFound(hash.to_hex()));
        }
        let bytes = fs::read(&path).map_err(|e| io_at(&path, e))?;
        let actual = ContentHash::of(&bytes);
        if &actual != hash {
            return Err(SnapshotError::CorruptObject {
                requested: hash.to_hex(),
                actual: actual.to_hex(),
            });
        }
        Ok(bytes)
    }

    pub fn has(&self, hash: &ContentHash) -> bool {
        self.path_for(hash).exists()
    }

    /// Every object in the store, as (hash, bytes), sorted by hash so the output is
    /// deterministic. Used to pack a checkpoint into a single self-contained bundle.
    pub fn read_all(&self) -> Result<Vec<(ContentHash, Vec<u8>)>> {
        let mut objects = Vec::new();
        let shards = match fs::read_dir(&self.objects_dir) {
            Ok(shards) => shards,
            Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(objects),
            Err(e) => return Err(io_at(&self.objects_dir, e)),
        };
        for shard in shards {
            let shard = shard.map_err(|e| io_at(&self.objects_dir, e))?.path();
            if !shard.is_dir() {
                continue;
            }
            for entry in fs::read_dir(&shard).map_err(|e| io_at(&shard, e))? {
                let path = entry.map_err(|e| io_at(&shard, e))?.path();
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                // Skip the in-flight temp files written before an atomic rename.
                if name.starts_with(".tmp-") {
                    continue;
                }
                let hash = ContentHash::from_hex(name)?;
                objects.push((hash, self.get(&hash)?));
            }
        }
        objects.sort_by_key(|a| a.0);
        Ok(objects)
    }

    fn path_for(&self, hash: &ContentHash) -> PathBuf {
        let hex = hash.to_hex();
        self.objects_dir.join(&hex[0..2]).join(hex)
    }
}

impl AsRef<Path> for CasStore {
    fn as_ref(&self) -> &Path {
        &self.objects_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, CasStore) {
        let dir = tempfile::tempdir().unwrap();
        let cas = CasStore::open(dir.path()).unwrap();
        (dir, cas)
    }

    #[test]
    fn put_then_get_roundtrips() {
        let (_dir, cas) = store();
        let hash = cas.put(b"hello reeg").unwrap();
        assert_eq!(cas.get(&hash).unwrap(), b"hello reeg");
        assert!(cas.has(&hash));
    }

    #[test]
    fn identical_content_dedups_to_one_hash() {
        let (_dir, cas) = store();
        let a = cas.put(b"same").unwrap();
        let b = cas.put(b"same").unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn missing_object_is_an_error() {
        let (_dir, cas) = store();
        let hash = ContentHash::of(b"never stored");
        assert!(matches!(
            cas.get(&hash),
            Err(SnapshotError::ObjectNotFound(_))
        ));
        assert!(!cas.has(&hash));
    }

    #[test]
    fn tampered_object_is_detected() {
        let (_dir, cas) = store();
        let hash = cas.put(b"original").unwrap();
        let path = cas.path_for(&hash);
        fs::write(&path, b"tampered").unwrap();
        assert!(matches!(
            cas.get(&hash),
            Err(SnapshotError::CorruptObject { .. })
        ));
    }
}
