# CLI reference

The `reeg` command drives the whole loop from a terminal: create an environment, run work in it, snapshot it, restore it, share it, and prove what it did.

Every important thing in computing became portable — files, code, containers, data — but not environments. Reeg is the layer over the sandbox: you run the work, Reeg versions and proves what it did. The CLI is how you operate that layer by hand or from a script.

## Install

There is no npm package. The CLI is built from the monorepo and exposes one binary, `reeg`.

```bash
pnpm install
pnpm --filter @reeg/cli build   # produces packages/cli/dist/index.js (bin: reeg)
# or run it straight from source during development:
pnpm --filter @reeg/cli dev -- <command> [args]
```

The snapshot and restore verbs also need the local engine, `reeg-engine`. Build it and point `REEG_ENGINE` at the binary:

```bash
cargo build --manifest-path engine/Cargo.toml
export REEG_ENGINE=/path/to/reeg-engine
```

## Quick start

```bash
export REEG_PACKAGE_ID=0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2  # testnet
export REEG_OPERATOR=0xyour_sui_address

reeg create
reeg run <machineId> -- python train.py
reeg checkpoint <machineId>
reeg verify <machineId>
```

`create`, `checkpoint`, `restore`, `fork`, `retire`, `grant`, `revoke`, and `enclave register` sign transactions, so they require both `REEG_PACKAGE_ID` and `REEG_OPERATOR` (or the matching `--package` / `--operator` flags). `run` is purely local; `verify`, `evidence`, and `audit` read only public data and need just a package id.

## Commands

| Verb | What it does | Touches chain |
|---|---|---|
| `create` | Mint a new environment you own, with a shareable access policy | yes |
| `run` | Run a command inside an environment, appending to its command log | no |
| `checkpoint` | Pack, encrypt, store on Walrus, anchor on Sui | yes |
| `restore` | Read the latest checkpoint, decrypt, unpack into a workdir | yes |
| `fork` | Create a child with provable lineage to the parent | yes |
| `retire` | Append a permanent end-of-life marker | yes |
| `grant` | Let another address decrypt and restore | yes |
| `revoke` | Stop an address from unlocking future restores | yes |
| `verify` | Confirm provenance from public Sui data, backend offline | read-only |
| `evidence` | Export a portable evidence file for an auditor | read-only |
| `audit` | Verify an exported evidence file, offline or anchored | read-only |
| `enclave register` | Register a measured Nitro enclave on chain | yes |

### create

```bash
reeg create
```

Mints a new environment under your operator address with a shared access policy, then records its local working directory. Prints the environment id, the `policy` id, the local `workdir`, and the `tx` digest.

### run

```bash
reeg run <machineId> -- <command...>
```

Runs a command in the environment's working directory and appends it to the command log. Local only — no signer or chain access. Put `--` before your command so the CLI passes its own flags through untouched. Exposes a memory directory (`REEG_MEMORY_DIR`) that the next checkpoint captures. The command's own exit code is surfaced as the CLI's exit code.

### checkpoint

```bash
reeg checkpoint <machineId> [--epochs <n>] [--threshold <t>] \
  [--attest --enclave-config <id>] [--enclave-cid <n>] [--enclave-port <n>]
```

Packs the working directory, encrypts it, stores it on Walrus, and anchors the blob and manifest hash on Sui in one transaction.

| Flag | Default | Meaning |
|---|---|---|
| `--epochs <n>` | `1` | Walrus storage epochs to keep the snapshot paid for. Roughly 2 weeks per epoch on testnet. EU AI Act Art. 12 wants ~6 months (`--epochs 13`). |
| `--threshold <t>` | configured (`1` on testnet) | Seal committee threshold (t-of-n key servers). Fixed at encryption time; a later grant cannot change it. Validated against the configured key-server set. |
| `--attest` | off | After anchoring, record a Nautilus enclave attestation of this checkpoint. Additive — a run without it is identical. |
| `--enclave-config <id>` | `REEG_ENCLAVE_CONFIG` | The `EnclaveConfig` id from `reeg enclave register`. Required with `--attest`. |
| `--enclave-cid <n>` | `16` | Enclave vsock CID. |
| `--enclave-port <n>` | `5005` | Enclave vsock port. |

Prints the manifest hash, optional memory pointer, Walrus `blob` id, byte size, `tx` digest, the retention window, the cost line, and the `t-of-n` decryption requirement. A disaster-recovery backup key is produced in memory and never logged. A retired environment declines further checkpoints.

Typical cost per create plus an encrypted checkpoint (1 epoch): ~0.0099 SUI + ~0.0119 WAL.

### restore

```bash
reeg restore <machineId> [--dest <dir>]
```

Reads the latest checkpoint from Walrus, decrypts it through a Seal session the caller authorizes, and unpacks it into a working directory. The owner restores into the machine's workdir; a grantee who never created the machine locally passes `--dest`. Prints the destination, manifest hash, workdir root hash, and memory pointer.

The decrypted plaintext is staged in an owner-only temp dir (mode `0700`, file `0600`, `O_EXCL`) and deleted afterward. Seal reads can briefly lag a just-changed policy, so a legitimate restore retries; a definitive access denial fails fast.

### fork

```bash
reeg fork <machineId>
```

Creates a child that records provable lineage to the parent. The child starts with an empty workdir; restore the parent's state into it when needed. Prints the `child` id, its (empty) workdir, and the `tx` digest.

### retire

```bash
reeg retire <machineId>
```

Appends a permanent, verifiable end-of-life marker to the provenance chain. The record stays on chain and verifiable offline; you may then stop paying for the run's Walrus storage once your retention window elapses. The client declines further checkpoints on a retired environment.

### grant

```bash
reeg grant <machineId> <grantee> [--role viewer|restore] [--until <when>]
```

Lets another address decrypt and restore the environment. `<grantee>` is a `0x...` address.

- `--role` — `viewer` or `restore` (default `restore`). A typo'd role is rejected at parse time.
- `--until` — an expiry, as an ISO 8601 time or a short duration (`7d`, `24h`, `30m`, `45s`). Absent means no expiry.

The policy id is read from the Machine on chain, so grant works without local state.

### revoke

```bash
reeg revoke <machineId> <grantee>
```

Stops an address from unlocking future restores. Note the honest limit it prints: revocation stops new key fetches, but every snapshot of a Machine shares one key, so anyone who already fetched it keeps access to past and future snapshots.

### verify

```bash
reeg verify <machineId> [-n <network>] [--rpc <url>] [--package <id>]
```

Confirms a Machine's provenance from public Sui data, with the Reeg backend offline — it reads only Sui. Prints `Verified` or `NOT verified`, then one `ok`/`FAIL` line per check. Exits non-zero if any check fails.

### evidence

```bash
reeg evidence <machineId> [--out <file>] [-n <network>] [--rpc <url>] [--package <id>]
```

Exports a portable evidence file an auditor can keep and verify offline. Read-only, no signer. `--out` sets the output path (defaults to `./evidence-<id>.json`). Prints the machine id, checkpoint count, provenance head, and the two `audit` commands to run.

### audit

```bash
reeg audit <file> [--anchor] [-n <network>] [--rpc <url>] [--package <id>]
```

Verifies an exported evidence file. Offline by default — it replays the file to its own recorded head, proving internal consistency. `--anchor` additionally confirms the file matches the live on-chain Machine, the real authenticity check. Prints one `ok`/`FAIL` line per check and exits non-zero on failure.

### enclave register

```bash
reeg enclave register [--cid <n>] [--port <n>]
```

The optional Nautilus tier — "prove which code ran." Fetches the local Nitro enclave's attestation document over vsock, verifies it on chain via `0x2::nitro_attestation`, and pins its PCRs and ed25519 key into a shared `EnclaveConfig`. Run once per enclave build. Defaults: `--cid 16`, `--port 5005`. Prints the new `EnclaveConfig` id and the exact `reeg checkpoint --attest` line to use it.

## Environment variables

Flags win over env vars, which win over verified testnet defaults.

| Variable | Used by | Meaning |
|---|---|---|
| `REEG_PACKAGE_ID` | all on-chain verbs | Reeg Move package id. Required for on-chain verbs (or `--package`). |
| `REEG_OPERATOR` | signing verbs | Sui address that signs. Required for signing verbs (or `--operator`). |
| `REEG_NETWORK` | all | `mainnet`, `testnet`, `devnet`, or `localnet`. Default `testnet`. |
| `REEG_RPC_URL` | chain reads/writes | Override the Sui RPC URL (default is the network's public fullnode). |
| `REEG_ENGINE` | `run`, `checkpoint`, `restore` | Path to the `reeg-engine` binary. Default `reeg-engine` on `PATH`. |
| `REEG_HOME` | local state | Root for local state and workdirs. Default `~/.reeg`. |
| `SUI_KEYSTORE` | signing verbs | Path to the Sui keystore. Default `~/.sui/sui_config/sui.keystore`. The key is loaded in memory only and never logged. |
| `REEG_SEAL_KEY_SERVERS` | encryption | Comma-separated Seal key-server object ids. |
| `REEG_SEAL_THRESHOLD` | encryption | Default committee threshold. Default `1`. |
| `REEG_WALRUS_UPLOAD_RELAY` | checkpoint | Walrus upload-relay host. |
| `REEG_DEBUG` | all | `1` prints full stack traces instead of one clean error line. |

The mainnet package id is `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`; testnet is `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.

## What works where

On mainnet today, encryption, Walrus storage, on-chain anchoring, and offline verification all work — `create`, `checkpoint`, `verify`, `evidence`, and `audit` run against live mainnet. The `restore` decrypt of an encrypted checkpoint currently waits on a provider Seal key server. The full encrypted checkpoint → restore → verify loop is proven end to end on testnet.
