# Quickstart

Create an environment, do work in it, checkpoint it, move it to another machine byte-identical, share it, and prove its history: all from the `reeg` CLI.

> **Use testnet to run the whole loop.** The full checkpoint → restore → verify path is proven end-to-end on testnet. On mainnet today, encryption, storage, anchoring, and offline verify work, but the decrypt step of a restore waits on a provider Seal key server.

## Prerequisites

- **Node ≥ 24**, **pnpm 10**, **Rust 1.95**, the **Sui CLI** (1.73), and the **Walrus CLI**.
- A **funded testnet address**, a little testnet SUI (gas) and WAL (storage), with its Ed25519 key in your local Sui keystore (`~/.sui/sui_config/sui.keystore`). On testnet both are free via the faucet and `walrus get-wal`.

## Install

There's no npm package yet: the CLI is built from the monorepo.

```sh
git clone <your-reeg-repo-url> reeg && cd reeg
corepack enable && corepack prepare pnpm@10.33.1 --activate
pnpm install
cargo build --manifest-path engine/Cargo.toml   # builds the reeg-engine binary
pnpm -r build                                    # builds the reeg CLI
```

If `reeg` isn't on your `PATH` afterward, run any command below as `pnpm --filter @reeg/cli exec reeg <verb>`.

## Configure

`REEG_ENGINE` points at the engine binary; `REEG_PACKAGE_ID` and `REEG_OPERATOR` are required for every on-chain command.

```sh
export REEG_ENGINE=engine/target/debug/reeg-engine
export REEG_NETWORK=testnet
export REEG_PACKAGE_ID=0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2
export REEG_OPERATOR=<your testnet address>
```

## The loop

```sh
reeg create                                        # mint a Machine you own -> <machineId>
reeg run <machineId> -- sh -c 'echo hi > note.txt'  # do work; captured in the command log
reeg checkpoint <machineId> --epochs 1              # snapshot -> Seal-encrypt -> Walrus -> anchor on Sui
reeg restore  <machineId> --dest /tmp/restored      # rebuild the workdir byte-identically on any host
reeg grant    <machineId> <address> --role restore  # let another address decrypt and restore
reeg revoke   <machineId> <address>                 # stop future decryption (forward-looking)
reeg fork     <machineId>                           # child Machine, lineage recorded on chain
reeg verify   <machineId>                           # verify the history offline — public Sui only, Reeg switched off
```

`REEG_HOME` (default `~/.reeg`) holds the local working state for a machine. Point it at a different directory to act as a separate "host". Restoring into a fresh `REEG_HOME` is how you prove a checkpoint comes back on a machine that never saw it.

## Run the whole story at once

The end-to-end acceptance test creates and checkpoints on one host, deletes it, restores byte-identically on a fresh host, verifies offline, shares to a second address that restores, then revokes, across simulated hosts:

```sh
export REEG_OPERATOR=<funded testnet address>
export REEG_GRANTEE=<second funded testnet address>
REEG_ENGINE=engine/target/debug/reeg-engine pnpm --filter @reeg/test run live:acceptance
```

## Next

- **[CLI reference](/docs/cli-reference)**: every verb, flag, and environment variable.
- **[How it works](/docs/how-it-works)**: what happens at the commit boundary.
