//! The canonical umask every tier runs agent commands under.
//!
//! `workdir_root_hash` commits to each file's permission bits (see reeg-snapshot's `tree`), so the
//! mode of a file an agent creates is part of a Machine's content identity. A process's umask
//! decides those bits, and the ambient umask differs by host, user, and tier: Amazon Linux's
//! `ec2-user` logs in with `0002` (group-writable, mode 0664), while a microVM's init and most
//! containers use `0022` (mode 0644). Left alone, the *same* `printf > file.txt` records a
//! different mode on the local tier than inside a microVM, so the local, OCI, and Firecracker tiers
//! produce different `workdir_root_hash` for identical work — and a restore-and-recapture on a
//! differently configured host would too. That breaks the cross-tier capture contract (phase M) and
//! the cross-host portability and provability guarantees (C3, C4, NFR-8).
//!
//! Pinning one canonical umask before every agent command makes a captured mode a function of what
//! the agent did (an explicit `chmod` is still honored) and nothing about the environment. `0022`
//! is the near-universal default and exactly what the microVM init already uses, so it is the
//! canonical value.

/// The umask agent commands run under in every tier.
pub const CANONICAL_UMASK: u32 = 0o022;

/// Apply [`CANONICAL_UMASK`]. Call from inside `Command::pre_exec` on the host tiers (so the child
/// inherits it across `exec`) and once at guest-agent startup inside the microVM.
#[cfg(unix)]
pub fn apply_canonical_umask() {
    // SAFETY: umask(2) takes no pointer arguments, cannot fail, and is async-signal-safe, so it is
    // sound to call here — including from the post-fork, pre-exec context where only async-signal-
    // safe calls are permitted.
    unsafe {
        libc::umask(CANONICAL_UMASK as libc::mode_t);
    }
}

/// No-op on non-Unix targets (the engine only runs on Unix; this keeps the crate buildable).
#[cfg(not(unix))]
pub fn apply_canonical_umask() {}
