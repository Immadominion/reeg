use std::path::PathBuf;

use reeg_snapshot::SnapshotError;
use thiserror::Error;

/// Errors the runtime adapter can return. Capture failures surface from the snapshot engine; a
/// command that cannot be launched is distinct from a command that runs and exits non-zero
/// (the latter is a normal outcome, not an error).
#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to launch command '{program}': {source}")]
    Launch {
        program: String,
        #[source]
        source: std::io::Error,
    },

    #[error("snapshot error: {0}")]
    Snapshot(#[from] SnapshotError),

    #[error("encoding error: {0}")]
    Encoding(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, RuntimeError>;
