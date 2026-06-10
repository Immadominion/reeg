use std::path::Path;

use reeg_snapshot::{CasStore, EnvironmentInputs, Manifest};

use crate::error::Result;
use crate::log::EventLog;

/// A command for the agent to run: a program, its arguments, and extra environment variables,
/// executed in the Machine's working directory. `env` is how the runtime exposes things like
/// `REEG_MEMORY_DIR` to the agent uniformly across tiers (local, OCI, Firecracker) — a plain
/// process-env inheritance only reaches the local tier, not the container or the microVM guest.
#[derive(Debug, Clone, Default)]
pub struct ExecRequest {
    pub program: String,
    pub args: Vec<String>,
    /// Extra environment variables set on the child, in addition to whatever it inherits.
    pub env: Vec<(String, String)>,
}

impl ExecRequest {
    pub fn new(
        program: impl Into<String>,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        ExecRequest {
            program: program.into(),
            args: args.into_iter().map(Into::into).collect(),
            env: Vec::new(),
        }
    }

    /// Add an environment variable the child will see (e.g. `REEG_MEMORY_DIR`).
    pub fn with_env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }
}

/// The result of running a command. A non-zero exit is a normal outcome, not an error.
#[derive(Debug, Clone)]
pub struct ExecOutcome {
    pub exit_code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl ExecOutcome {
    pub fn success(&self) -> bool {
        self.exit_code == 0
    }

    pub fn stdout_utf8_lossy(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }
}

/// The runtime adapter: one interface giving an agent a place to work (run commands, read and
/// write files), with the isolation tier behind it swappable (the local tier here, an OCI
/// container tier, and the Firecracker microVM tier in phase M). Capture is shared across all
/// tiers because the moat lives in the snapshot engine, not the isolation boundary.
pub trait Runtime {
    /// The Machine's working directory, the filesystem surface the agent uses.
    fn workdir(&self) -> &Path;

    /// The command log accumulated so far.
    fn event_log(&self) -> &EventLog;

    /// Run a command in the working directory, capture its output, and record it in the log.
    fn exec(&mut self, request: &ExecRequest) -> Result<ExecOutcome>;

    /// Capture the live working directory into the store and build the checkpoint manifest.
    /// Identical for every tier; only `exec` and isolation differ between them.
    fn checkpoint(&self, cas: &CasStore, inputs: EnvironmentInputs) -> Result<Manifest> {
        Ok(reeg_snapshot::checkpoint(self.workdir(), cas, inputs)?)
    }
}
