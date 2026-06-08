//! reeg-runtime: the runtime adapter that gives an agent a place to work.
//!
//! One interface (`Runtime`) exposes a filesystem (a working directory) and command execution,
//! with the isolation tier behind it swappable: the local tier here for development and tests,
//! an OCI container tier, and a Firecracker microVM tier (phase M) for hard multi-tenant
//! isolation. Every tier shares the same capture path, because the product's moat is the
//! content-addressed snapshot engine, not the isolation boundary. The runtime drives
//! reeg-snapshot to capture the live working directory at checkpoint time and records a
//! deterministic command log to feed provenance. It never touches the verification path.
//!
//! Feature flags (Linux only):
//! - `oci`         — enables `OciRuntime`; requires `runc` on PATH.
//! - `firecracker` — enables `FirecrackerRuntime`; requires `/dev/kvm` and the `firecracker` binary.

mod error;
mod log;
mod process;
mod runtime;

#[cfg(all(target_os = "linux", feature = "oci"))]
mod oci;
#[cfg(all(target_os = "linux", feature = "firecracker"))]
mod firecracker;

pub use error::{Result, RuntimeError};
pub use log::{CommandEvent, EventLog, digest_of};
pub use process::LocalRuntime;
pub use runtime::{ExecOutcome, ExecRequest, Runtime};

#[cfg(all(target_os = "linux", feature = "oci"))]
pub use oci::{OciConfig, OciRuntime};
#[cfg(all(target_os = "linux", feature = "firecracker"))]
pub use firecracker::{FirecrackerConfig, FirecrackerRuntime};

// Restore, drift, and bundle pack/unpack reuse the snapshot engine directly; re-exported so a
// runtime caller has one import surface for the full create/run/checkpoint/restore loop.
pub use reeg_snapshot::{
    CasStore, DriftReport, EnvironmentInputs, Manifest, Package, drift, pack, restore, unpack,
};
