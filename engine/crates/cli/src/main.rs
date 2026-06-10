//! reeg-engine: the local engine binary the TypeScript `reeg` CLI shells out to. It is the
//! Rust side of the artifact boundary: run a command in a Machine working directory, pack the
//! working directory into a self-contained checkpoint bundle, and restore a bundle. The TS
//! client encrypts, stores, and anchors the bundle; it never reaches into the engine. All
//! output is JSON on stdout so the caller can parse it.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[cfg(target_os = "linux")]
mod guest_agent;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use reeg_runtime::{
    CasStore, CommandEvent, EnvironmentInputs, ExecRequest, LocalRuntime, Runtime, digest_of, pack,
    unpack,
};

#[derive(Parser)]
#[command(
    name = "reeg-engine",
    about = "Reeg engine: run commands, pack and restore checkpoint bundles."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run a command in a Machine working directory, appending to the command log.
    Run {
        #[arg(long)]
        workdir: PathBuf,
        #[arg(long)]
        log: PathBuf,
        /// The program and its arguments, given after `--`.
        #[arg(last = true, required = true)]
        argv: Vec<String>,
    },
    /// Pack a working directory (and optional agent memory dir) into a checkpoint bundle.
    Checkpoint {
        #[arg(long)]
        workdir: PathBuf,
        #[arg(long)]
        out: PathBuf,
        #[arg(long)]
        log: Option<PathBuf>,
        /// Agent memory directory to capture alongside the working directory.
        #[arg(long)]
        memory: Option<PathBuf>,
    },
    /// Restore a checkpoint bundle into a destination directory (and optional memory dir).
    Restore {
        #[arg(long)]
        bundle: PathBuf,
        #[arg(long)]
        dest: PathBuf,
        /// Where to rebuild the agent memory directory, if the bundle carries one.
        #[arg(long)]
        memory: Option<PathBuf>,
    },
    /// Run as the in-guest agent for the Firecracker microVM tier (Linux only).
    /// Listens on vsock for exec and snapshot requests from the host FirecrackerRuntime.
    GuestAgent {
        /// vsock port to listen on. Must match the host-side `FirecrackerConfig::agent_port`.
        #[arg(long, default_value = "52")]
        port: u32,
    },
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("reeg-engine error: {err:#}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<()> {
    match Cli::parse().command {
        Command::Run { workdir, log, argv } => cmd_run(&workdir, &log, &argv),
        Command::GuestAgent { port } => cmd_guest_agent(port),
        Command::Checkpoint {
            workdir,
            out,
            log,
            memory,
        } => cmd_checkpoint(&workdir, &out, log.as_deref(), memory.as_deref()),
        Command::Restore {
            bundle,
            dest,
            memory,
        } => cmd_restore(&bundle, &dest, memory.as_deref()),
    }
}

fn cmd_run(workdir: &Path, log: &Path, argv: &[String]) -> Result<()> {
    let (program, args) = argv.split_first().context("missing program after --")?;
    let mut entries = load_log(log)?;

    let mut runtime = LocalRuntime::create(workdir)?;
    let outcome = runtime.exec(&ExecRequest::new(program.clone(), args.iter().cloned()))?;

    // Carry the recorded entry into the persisted log, renumbering its seq to its position.
    let mut entry = runtime.event_log().entries()[0].clone();
    entry.seq = entries.len() as u64;
    entries.push(entry);
    fs::write(log, serde_json::to_vec(&entries)?)?;

    print_json(&serde_json::json!({ "exitCode": outcome.exit_code, "seq": entries.len() - 1 }));
    Ok(())
}

fn cmd_checkpoint(
    workdir: &Path,
    out: &Path,
    log: Option<&Path>,
    memory: Option<&Path>,
) -> Result<()> {
    let scratch = tempfile::tempdir()?;
    let cas = CasStore::open(scratch.path())?;
    // Only capture a memory directory that actually exists; the TS client passes one only when the
    // agent has memory, so a memory-less run keeps memory_pointer null and the same manifest shape.
    let memory = memory.filter(|path| path.exists());
    let (bundle, manifest) = pack(workdir, memory, &cas, EnvironmentInputs::default())?;
    fs::write(out, &bundle)?;

    let entries = match log {
        Some(path) => load_log(path)?,
        None => Vec::new(),
    };

    print_json(&serde_json::json!({
        "manifestHashHex": manifest.manifest_hash()?.to_hex(),
        "workdirRootHashHex": manifest.workdir_root_hash.to_hex(),
        "memoryPointer": manifest.memory_pointer,
        "payloadHashHex": hex::encode(digest_of(&entries)?),
        "bundleBytes": bundle.len(),
    }));
    Ok(())
}

fn cmd_restore(bundle: &Path, dest: &Path, memory: Option<&Path>) -> Result<()> {
    let bytes = fs::read(bundle)?;
    let scratch = tempfile::tempdir()?;
    let cas = CasStore::open(scratch.path())?;
    let manifest = unpack(&bytes, &cas, dest, memory)?;

    print_json(&serde_json::json!({
        "manifestHashHex": manifest.manifest_hash()?.to_hex(),
        "workdirRootHashHex": manifest.workdir_root_hash.to_hex(),
        "memoryPointer": manifest.memory_pointer,
    }));
    Ok(())
}

fn load_log(path: &Path) -> Result<Vec<CommandEvent>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn print_json(value: &serde_json::Value) {
    println!("{value}");
}

/// Run as the in-guest agent for the Firecracker microVM tier. Listens on vsock for exec
/// and snapshot requests from the host `FirecrackerRuntime`. The implementation is Linux-only
/// because vsock is a Linux kernel interface; on other platforms the command is present in
/// the help text but exits with an informative error.
fn cmd_guest_agent(port: u32) -> Result<()> {
    #[cfg(target_os = "linux")]
    {
        guest_agent::run(port).map_err(|e| anyhow::anyhow!("{e:#}"))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = port;
        anyhow::bail!("guest-agent requires Linux (vsock is a Linux kernel interface)")
    }
}
