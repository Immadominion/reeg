use std::path::{Path, PathBuf};
use thiserror::Error;

/// Errors the snapshot engine can return. Verification depends on capture being exact, so
/// the engine fails loudly (for example on an unsupported file type or a corrupt object)
/// rather than silently producing a checkpoint that cannot be trusted.
#[derive(Debug, Error)]
pub enum SnapshotError {
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("object {0} not found in the content-addressed store")]
    ObjectNotFound(String),

    #[error("object {requested} is corrupt: its bytes hash to {actual}")]
    CorruptObject { requested: String, actual: String },

    #[error("unsupported file type at {0}; only files, directories, and symlinks are captured")]
    UnsupportedFileType(PathBuf),

    #[error("non-UTF-8 path component at {0}; capture requires UTF-8 names")]
    NonUtf8Path(PathBuf),

    #[error("entry name {0:?} is unsafe to restore (contains a path separator or traversal)")]
    UnsafeEntryName(String),

    #[error("invalid content hash {0:?}")]
    InvalidHash(String),

    #[error("canonical encoding failed: {0}")]
    Encoding(#[from] serde_json::Error),

    #[error("malformed checkpoint bundle: {0}")]
    Bundle(String),
}

pub type Result<T> = std::result::Result<T, SnapshotError>;

/// Build an [`SnapshotError::Io`] that carries the offending path, so failures point at the
/// exact file rather than a bare errno.
pub(crate) fn io_at(path: &Path, source: std::io::Error) -> SnapshotError {
    SnapshotError::Io {
        path: path.to_path_buf(),
        source,
    }
}
