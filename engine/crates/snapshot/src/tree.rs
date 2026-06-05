use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::cas::CasStore;
use crate::error::{Result, SnapshotError, io_at};
use crate::hash::ContentHash;

/// One entry inside a directory node. Only what is needed to rebuild the entry exactly is
/// recorded; owner, timestamps, and inode numbers are deliberately excluded so the same
/// tree on two hosts produces the same hashes (see manifest-spec.md).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Entry {
    File { mode: u32, hash: ContentHash },
    Dir { mode: u32, hash: ContentHash },
    Symlink { target: String },
}

/// A directory node: its entries keyed by name. Serialized as a plain object so the node's
/// bytes (and therefore its hash) are exactly the canonical entry map. A `BTreeMap` keeps
/// names sorted, which is what makes the hash independent of directory iteration order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DirNode {
    pub entries: BTreeMap<String, Entry>,
}

/// The result of comparing a restored directory against the hashes a checkpoint recorded.
/// A clean report is the byte-identical guarantee phase B must meet; anything else names
/// the paths that differ rather than hiding the drift.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DriftReport {
    pub matches: bool,
    pub differences: Vec<String>,
}

impl DriftReport {
    pub fn is_clean(&self) -> bool {
        self.matches
    }
}

/// Capture `dir` into the store and return the root directory node hash (the
/// `workdir_root_hash`). Walks bottom-up so each node commits to all of its descendants.
pub fn capture(dir: &Path, cas: &CasStore) -> Result<ContentHash> {
    let mut entries = BTreeMap::new();
    for dir_entry in fs::read_dir(dir).map_err(|e| io_at(dir, e))? {
        let dir_entry = dir_entry.map_err(|e| io_at(dir, e))?;
        let path = dir_entry.path();
        let name = dir_entry
            .file_name()
            .to_str()
            .ok_or_else(|| SnapshotError::NonUtf8Path(path.clone()))?
            .to_string();
        let file_type = dir_entry.file_type().map_err(|e| io_at(&path, e))?;

        let entry = if file_type.is_symlink() {
            let target = fs::read_link(&path).map_err(|e| io_at(&path, e))?;
            let target = target
                .to_str()
                .ok_or_else(|| SnapshotError::NonUtf8Path(path.clone()))?
                .to_string();
            Entry::Symlink { target }
        } else if file_type.is_file() {
            let bytes = fs::read(&path).map_err(|e| io_at(&path, e))?;
            Entry::File {
                mode: mode_of(&path)?,
                hash: cas.put(&bytes)?,
            }
        } else if file_type.is_dir() {
            Entry::Dir {
                mode: mode_of(&path)?,
                hash: capture(&path, cas)?,
            }
        } else {
            return Err(SnapshotError::UnsupportedFileType(path));
        };
        entries.insert(name, entry);
    }

    let node = DirNode { entries };
    let bytes = serde_json::to_vec(&node)?;
    cas.put(&bytes)
}

/// Rebuild the directory recorded at `root` under `dest`, byte for byte.
pub fn restore(root: &ContentHash, cas: &CasStore, dest: &Path) -> Result<()> {
    fs::create_dir_all(dest).map_err(|e| io_at(dest, e))?;
    let node = load_node(root, cas)?;
    for (name, entry) in &node.entries {
        validate_name(name)?;
        let path = dest.join(name);
        match entry {
            Entry::File { mode, hash } => {
                let content = cas.get(hash)?;
                fs::write(&path, &content).map_err(|e| io_at(&path, e))?;
                set_mode(&path, *mode)?;
            }
            Entry::Dir { mode, hash } => {
                restore(hash, cas, &path)?;
                // Set the directory mode after writing its children, so a read-only mode
                // cannot block restoring what is inside it.
                set_mode(&path, *mode)?;
            }
            Entry::Symlink { target } => {
                std::os::unix::fs::symlink(target, &path).map_err(|e| io_at(&path, e))?;
            }
        }
    }
    Ok(())
}

/// Re-capture `dest` and compare it to the `expected` root hash, naming any path that
/// differs. Used to prove a restore is byte-identical and to report drift when it is not.
pub fn drift(expected: &ContentHash, cas: &CasStore, dest: &Path) -> Result<DriftReport> {
    let actual = capture(dest, cas)?;
    if &actual == expected {
        return Ok(DriftReport {
            matches: true,
            differences: Vec::new(),
        });
    }
    let mut differences = Vec::new();
    compare(expected, &actual, "", cas, &mut differences)?;
    Ok(DriftReport {
        matches: false,
        differences,
    })
}

fn compare(
    expected: &ContentHash,
    actual: &ContentHash,
    prefix: &str,
    cas: &CasStore,
    out: &mut Vec<String>,
) -> Result<()> {
    if expected == actual {
        return Ok(());
    }
    let expected_node = load_node(expected, cas)?;
    let actual_node = load_node(actual, cas)?;
    let names: BTreeSet<&String> = expected_node
        .entries
        .keys()
        .chain(actual_node.entries.keys())
        .collect();

    for name in names {
        let path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        match (
            expected_node.entries.get(name),
            actual_node.entries.get(name),
        ) {
            (Some(e), Some(a)) if e == a => {}
            (Some(Entry::Dir { hash: eh, .. }), Some(Entry::Dir { hash: ah, .. })) => {
                compare(eh, ah, &path, cas, out)?;
            }
            (Some(_), Some(_)) => out.push(format!("changed: {path}")),
            (Some(_), None) => out.push(format!("missing: {path}")),
            (None, Some(_)) => out.push(format!("unexpected: {path}")),
            (None, None) => unreachable!("name came from the union of both nodes"),
        }
    }
    Ok(())
}

fn load_node(hash: &ContentHash, cas: &CasStore) -> Result<DirNode> {
    let bytes = cas.get(hash)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn mode_of(path: &Path) -> Result<u32> {
    let meta = fs::symlink_metadata(path).map_err(|e| io_at(path, e))?;
    // Only the permission bits matter for restore; the type is recorded separately and the
    // owner is intentionally not captured.
    Ok(meta.permissions().mode() & 0o777)
}

fn set_mode(path: &Path, mode: u32) -> Result<()> {
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(|e| io_at(path, e))
}

/// Reject entry names that could escape the destination when restoring an untrusted
/// manifest. Captured names are always single components, so this only bites on tampering.
fn validate_name(name: &str) -> Result<()> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\0') {
        return Err(SnapshotError::UnsafeEntryName(name.to_string()));
    }
    Ok(())
}
