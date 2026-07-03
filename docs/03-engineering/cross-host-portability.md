# Cross-host portability (build-roadmap Phase J)

Moving a run to a host that never saw it, and proving the moved copy is the same one. This records
what restore-on-a-fresh-host guarantees, how the acceptance test proves it, and the honest limits.
The headline acceptance bar is C1 through C4 together: own, share, move, prove.

## What a fresh host needs

To rebuild an environment on a host that never ran it, the host needs only:

- the **machine id** (a public Sui object id, shared out of band),
- the **package id** and network (config, not secret),
- the **caller's own key** in the local sui keystore (the operator, or a grantee), and
- the **reeg engine** binary and CLI.

It needs nothing from the original host: no working directory, no local cache, no Reeg backend.
`reeg restore <machineId> --dest <dir>` reads the Machine object from Sui, fetches the pinned
ciphertext from Walrus, decrypts it with a Seal session the caller authorizes, and the engine
unpacks the content-addressed bundle into `<dir>`. A grantee does the same with `--operator
<theirAddress>`; they never need gas.

## Why the restore is byte-identical anywhere

The checkpoint bundle is content-addressed (BLAKE3): the Walrus blob id is the content hash, and
every object inside the bundle is keyed by its own hash. On unpack the engine re-verifies each
object against the manifest, so a restored working directory is the same bytes that were captured,
on any host, OS, or architecture, or it fails closed. The bytes do not depend on the restoring
host. `reeg verify`, reading only public Sui + Walrus, then confirms the restored manifest is the
one the chain pinned and that the provenance chain replays to the on-chain head, with no Reeg
service involved (NFR-1).

The acceptance test ([test/live/acceptance.ts](../../test/live/acceptance.ts),
`pnpm --filter @reeg/test run live:acceptance`) proves this end to end: host A creates and
checkpoints, host A is then deleted, a fresh host B restores from Sui + Walrus alone and its
working directory hashes identically to A's, verify passes offline, a grantee on a third host C
restores byte-identically, and after a revoke that grantee is denied while verify still passes.

## Honest limits

- **Restore reproduces filesystem state, not re-execution.** The bundle is a commit-boundary
  snapshot of the working directory, so the restored files are byte-identical anywhere. Re-running
  the agent's commands on a different host can still produce different output if that host's
  toolchain or libraries differ. The manifest records packages, environment (secrets redacted),
  and tool versions as a description of the environment, but restore rebuilds the working directory,
  it does not provision a toolchain. Pinning libraries and standardizing the restore environment is
  the operator's responsibility today; the Firecracker microVM tier (phase M) is where a pinned,
  standardized base image makes heterogeneous-host re-execution reproducible by construction.
- **Not a live-memory image.** There is no CRIU-style process checkpoint. Restore resumes from the
  last checkpoint's filesystem, not mid-process memory, so in-flight state that was never written to
  disk is not carried across hosts. This is the deliberate commit-boundary model, not a live mirror.
- **Forked-child restore is cross-identity.** A fork inherits the parent's checkpoint pointer, whose
  ciphertext is under the parent policy identity; restoring inherited state needs the parent policy.
  See [sharing-design.md](sharing-design.md). A forked child's own future checkpoints restore
  normally.
- **Sharing is forward-looking with a caveat.** Revocation stops new key fetches but cannot recall a
  key a grantee already pulled; see the revocation note in [sharing-design.md](sharing-design.md).
