use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{Result, RuntimeError};
use crate::log::EventLog;
use crate::runtime::{ExecOutcome, ExecRequest, Runtime};

/// The local runtime tier: runs commands directly in the Machine's working directory on the
/// host. It has no isolation boundary, so it is for local development, the checkpoint/restore
/// loop, and tests, never for running untrusted agent code in production. The container tier
/// (OCI + OverlayFS) and the microVM tier (Firecracker, phase M) implement the same `Runtime`
/// trait and add isolation; the capture and verification paths do not change.
pub struct LocalRuntime {
    workdir: PathBuf,
    log: EventLog,
}

impl LocalRuntime {
    /// Create a Machine working directory (and the runtime over it).
    pub fn create(workdir: impl Into<PathBuf>) -> Result<Self> {
        let workdir = workdir.into();
        std::fs::create_dir_all(&workdir).map_err(|source| RuntimeError::Io {
            path: workdir.clone(),
            source,
        })?;
        Ok(LocalRuntime {
            workdir,
            log: EventLog::new(),
        })
    }
}

impl Runtime for LocalRuntime {
    fn workdir(&self) -> &Path {
        &self.workdir
    }

    fn event_log(&self) -> &EventLog {
        &self.log
    }

    fn exec(&mut self, request: &ExecRequest) -> Result<ExecOutcome> {
        let output = Command::new(&request.program)
            .args(&request.args)
            .current_dir(&self.workdir)
            .output()
            .map_err(|source| RuntimeError::Launch {
                program: request.program.clone(),
                source,
            })?;

        let exit_code = output.status.code().unwrap_or(-1);
        self.log.record(
            &request.program,
            &request.args,
            exit_code,
            &output.stdout,
            &output.stderr,
        );

        Ok(ExecOutcome {
            exit_code,
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reeg_snapshot::{CasStore, EnvironmentInputs};

    fn sh(script: &str) -> ExecRequest {
        ExecRequest::new("sh", ["-c", script])
    }

    fn runtime() -> (tempfile::TempDir, LocalRuntime) {
        let dir = tempfile::tempdir().unwrap();
        let rt = LocalRuntime::create(dir.path().join("work")).unwrap();
        (dir, rt)
    }

    #[test]
    fn exec_captures_output_and_exit() {
        let (_dir, mut rt) = runtime();
        let outcome = rt.exec(&sh("echo hello")).unwrap();
        assert!(outcome.success());
        assert_eq!(outcome.stdout_utf8_lossy().trim(), "hello");
        assert_eq!(rt.event_log().len(), 1);
    }

    #[test]
    fn nonzero_exit_is_recorded_not_an_error() {
        let (_dir, mut rt) = runtime();
        let outcome = rt.exec(&sh("exit 7")).unwrap();
        assert!(!outcome.success());
        assert_eq!(outcome.exit_code, 7);
        assert_eq!(rt.event_log().entries()[0].exit_code, 7);
    }

    #[test]
    fn launching_a_missing_program_errors() {
        let (_dir, mut rt) = runtime();
        let result = rt.exec(&ExecRequest::new(
            "reeg-no-such-binary-xyz",
            [] as [String; 0],
        ));
        assert!(matches!(result, Err(RuntimeError::Launch { .. })));
    }

    #[test]
    fn log_digest_is_deterministic_across_identical_sessions() {
        let (_a, mut ra) = runtime();
        let (_b, mut rb) = runtime();
        for rt in [&mut ra, &mut rb] {
            rt.exec(&sh("echo reeg")).unwrap();
            rt.exec(&sh("true")).unwrap();
        }
        assert_eq!(
            ra.event_log().digest_hex().unwrap(),
            rb.event_log().digest_hex().unwrap()
        );
    }

    #[test]
    fn checkpoint_then_restore_is_byte_identical() {
        let store = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let cas = CasStore::open(store.path()).unwrap();
        let (_dir, mut rt) = runtime();

        // An agent builds up a workdir.
        rt.exec(&sh("mkdir -p src && printf 'fn main() {}' > src/main.rs"))
            .unwrap();
        rt.exec(&sh("printf 'hello reeg' > README")).unwrap();

        let manifest = rt.checkpoint(&cas, EnvironmentInputs::default()).unwrap();
        reeg_snapshot::restore(&manifest, &cas, dest.path()).unwrap();

        let report = reeg_snapshot::drift(&manifest, &cas, dest.path()).unwrap();
        assert!(
            report.is_clean(),
            "unexpected drift: {:?}",
            report.differences
        );
        assert_eq!(
            std::fs::read(dest.path().join("src/main.rs")).unwrap(),
            b"fn main() {}"
        );
    }
}
