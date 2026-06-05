use serde::{Deserialize, Serialize};

use crate::error::Result;

/// One command the agent ran. Output is committed by content hash, not stored, and wall-clock
/// time is deliberately omitted, so the log digest is reproducible and safe to chain into
/// provenance (the verifier and a re-run must agree on it).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandEvent {
    pub seq: u64,
    pub program: String,
    pub args: Vec<String>,
    pub exit_code: i32,
    pub stdout_hash: String,
    pub stderr_hash: String,
}

/// The ordered log of commands run in a Machine since it was created. Its digest is the input
/// to a checkpoint's provenance payload hash (build-roadmap phase E feeds it to
/// register_checkpoint).
#[derive(Debug, Default)]
pub struct EventLog {
    entries: Vec<CommandEvent>,
}

impl EventLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn entries(&self) -> &[CommandEvent] {
        &self.entries
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub(crate) fn record(
        &mut self,
        program: &str,
        args: &[String],
        exit_code: i32,
        stdout: &[u8],
        stderr: &[u8],
    ) {
        self.entries.push(CommandEvent {
            seq: self.entries.len() as u64,
            program: program.to_string(),
            args: args.to_vec(),
            exit_code,
            stdout_hash: hex::encode(blake3::hash(stdout).as_bytes()),
            stderr_hash: hex::encode(blake3::hash(stderr).as_bytes()),
        });
    }

    /// BLAKE3 over the canonical encoding of the log. Deterministic for a given command
    /// sequence and outputs, regardless of when the commands ran.
    pub fn digest(&self) -> Result<[u8; 32]> {
        digest_of(&self.entries)
    }

    pub fn digest_hex(&self) -> Result<String> {
        Ok(hex::encode(self.digest()?))
    }
}

/// The log digest over a sequence of entries. Exposed so a caller that persists the log across
/// process invocations (the reeg-engine binary) computes the same provenance payload hash.
pub fn digest_of(entries: &[CommandEvent]) -> Result<[u8; 32]> {
    let bytes = serde_json::to_vec(entries)?;
    Ok(*blake3::hash(&bytes).as_bytes())
}
