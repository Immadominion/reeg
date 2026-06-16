# Reeg — Demo Runbook (exact steps to film the video)

> Companion to [demo-video-script.md](demo-video-script.md). This is the literal,
> copy-pasteable sequence to run Reeg yourself in a fresh environment and capture each beat.
> Every command here was taken from the actual CLI/source, not guessed. Where the repo
> genuinely doesn't pin something down, it's marked **⚠ confirm before camera day** — handle
> those once, in advance, so nothing stalls while recording.

---

## Read this first (the 6 things that will bite you)

1. **Film on TESTNET, not mainnet.** The full loop — checkpoint → **restore (decrypt)** →
   verify — is proven end-to-end *only on testnet*. Mainnet decrypt is currently blocked (no
   free public Seal key server), so a restore on mainnet **will fail on camera.** Use mainnet
   only as a read-only "it's real" explorer shot.
2. **There is no `npm install`.** The `reeg` CLI is not published. The only way to get it is
   build-from-the-monorepo (clone → `pnpm install` → build). Budget time for this.
3. **You need TWO funded testnet addresses** — an **operator** (you, the owner) and a
   **grantee** (the teammate you share with). Both need a little testnet **SUI** (gas) **and**
   testnet **WAL** (storage), and both keys must live in your local Sui keystore.
4. **"Different machines" are just different folders.** You don't need 3 laptops. Each "host"
   is a separate `REEG_HOME` directory (`/tmp/host-a`, `/tmp/host-b`, `/tmp/host-c`). Restoring
   into a fresh `REEG_HOME` *is* "bring it back on a machine that never saw it."
5. **`REEG_PACKAGE_ID` and `REEG_OPERATOR` are mandatory** for the on-chain commands — the CLI
   errors without them. They're in the export block below.
6. **The "54/54" in the script is the test-suite count, not what `reeg verify` prints.** Live,
   `reeg verify` prints ~5–7 named `ok` checks and exits 0. Decide which you film (see Beat 6).

---

## Part A — one-time setup (do this BEFORE camera day)

### A1. Install the toolchain (once, on your machine)

| Tool | Version | How |
| --- | --- | --- |
| Node | 24.5.0 (`.node-version`) | a version manager (`nvm install 24.5.0` / `fnm`) |
| pnpm | 10.33.1 | `corepack enable && corepack prepare pnpm@10.33.1 --activate` |
| Rust | 1.95 (auto-selected) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh -s -- -y` |
| Sui CLI | 1.73.1 | per Mysten docs (`suiup`, or cargo/brew) — **⚠ not pinned in repo** |
| Walrus CLI | latest | per <https://docs.wal.app> — **⚠ not pinned in repo** |

### A2. Clone and build

```sh
git clone <YOUR-REEG-REPO-URL> reeg && cd reeg      # ⚠ supply the clone URL
corepack enable && corepack prepare pnpm@10.33.1 --activate
pnpm install                                        # installs workspaces; links the `reeg` bin
cargo build --manifest-path engine/Cargo.toml       # builds engine/target/debug/reeg-engine
pnpm -r build                                        # builds the CLI (packages/cli/dist/index.js) + the rest
```

After this, the `reeg` command should be runnable. If `reeg` is **not** found on PATH on the
day, use this exact fallback for every `reeg …` below:

```sh
pnpm --filter @reeg/cli exec reeg <verb>            # fallback if `reeg` isn't on PATH
```

### A3. Create + fund the two testnet addresses

```sh
sui client switch --env testnet
sui client new-address ed25519        # -> OPERATOR address (note the 0x...)
sui client new-address ed25519        # -> GRANTEE address  (note the 0x...)
sui client addresses                  # confirm both are listed; keys are now in your keystore
```

Fund **each** address with testnet SUI (gas) and WAL (storage). On testnet this is free:

```sh
# operator
sui client switch --address <OPERATOR>
sui client faucet                     # ⚠ confirm the working testnet faucet in advance
walrus get-wal                        # swaps a little testnet SUI -> WAL for the active address
sui client gas                        # should now show SUI coins

# grantee (repeat)
sui client switch --address <GRANTEE>
sui client faucet
walrus get-wal
```

> **⚠ Faucet is the one likely snag.** The repo says "fund free via faucet + `walrus get-wal`"
> but doesn't pin the exact testnet SUI faucet command/URL. `sui client faucet` is the
> standard one; if it's rate-limited, use the web faucet for each address. **Test this the day
> before** so you're not stuck on camera.

### A4. Rehearse once with the automated run (do NOT skip)

There's a one-command end-to-end test that runs the *entire* story across simulated hosts
(create → checkpoint → kill host A → restore on host B → verify → share to grantee → grantee
restores → revoke → denied). Run it once to prove your setup works before you film:

```sh
export REEG_OPERATOR=<OPERATOR>
export REEG_GRANTEE=<GRANTEE>
REEG_ENGINE=engine/target/debug/reeg-engine pnpm --filter @reeg/test run live:acceptance
```

If that passes, every manual step below will work. (It throws a clear message if either
address isn't set/funded.) You can even film *this* as a clean, fast "it just works" cut.

---

## Part B — set the environment for filming

Open your terminal recording. Paste this block once (fill in your two addresses). `REEG_HOME`
is what makes a folder act like a separate "host."

```sh
export REEG_ENGINE=engine/target/debug/reeg-engine
export REEG_NETWORK=testnet
export REEG_PACKAGE_ID=0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2
export REEG_OPERATOR=<OPERATOR>          # your address
export REEG_GRANTEE=<GRANTEE>            # the teammate address
export REEG_HOME=/tmp/host-a            # "Host A"
```

> **⚠ Package id:** the value above is testnet from `config/testnet.json`. Ignore the different
> (stale) id in `MANUAL-TEST.local.md`. Confirm it's live with a quick `reeg verify` of any
> known testnet machine before the shoot.

---

## Part C — the filmed sequence (each step = one beat)

> Tip: keep the machine id in a shell variable so you don't fat-finger it on camera:
> after `reeg create`, run `export M=<the 0x machineId it printed>`.

### Beat 1 — Own it *(create the environment)*

```sh
reeg create
```
**You'll see:** `Created environment 0x…` + `policy:`, `workdir:`, `tx:` lines. Copy the id →
`export M=0x…`.
**On screen:** a Machine minted on-chain to *your* key — you own it.

### Beat 2 — work happens *(state accumulates)*

```sh
reeg run $M -- sh -c 'echo "owned, shareable, portable" > notes.md && mkdir -p src/lib && printf "a\nb\nc\n" > src/lib/data.txt && echo done > src/STATUS'
```
**You'll see:** the command runs in the machine's workdir and exits 0. Files now exist under
`/tmp/host-a/machines/$M/work`. (This is purely local — no chain.)
**On screen:** an agent/environment doing real work; state building up.

### Beat 3 — checkpoint *(snapshot → encrypt → Walrus → anchor on Sui)*

```sh
reeg checkpoint $M --epochs 1
```
**You'll see:** `Snapshot saved…` + `manifest:`, `blob:`, `bytes:`, `tx:`, a retention line, a
**cost** line, and `decryption: requires 1-of-1 Seal key server`. Spends a little testnet SUI + WAL.
**Caption the cost:** *~0.0099 SUI + ~0.0119 WAL per create + encrypted checkpoint (1 epoch).*

### Beat 4 — Move it *(kill this host, restore on another, byte-identical)*

```sh
# kill Host A: the environment no longer lives on this machine
rm -rf "/tmp/host-a/machines/$M/work"

# Host B — a fresh host that never saw it; restore from Sui + Walrus alone
export REEG_HOME=/tmp/host-b
reeg restore $M --dest /tmp/restored-b
```
**You'll see:** `Restored 0x… into /tmp/restored-b` + a `manifest:`/`root:` that matches the
checkpoint. The files reappear, byte-identical.
**Prove it on camera (the green "IDENTICAL"):**
```sh
# if you kept a copy of host-a's work, diff it; otherwise the matching root hash is the proof
diff -r /tmp/restored-b /tmp/restored-b && echo IDENTICAL    # replace first path with a saved baseline if you have one
```
> Practical note: you deleted host-a's work, so to show a literal `diff`, copy the workdir to
> a baseline (`cp -r`) *before* the `rm` in a rehearsal, or just let the **matching root hash**
> from the restore output be the proof. The automated `live:acceptance` does this with a
> deterministic tree hash.

### Beat 5 — Share it *(grant a second address, they restore on their own host; then revoke)*

```sh
# as the owner (still on Host B), grant the grantee restore rights
reeg grant $M $REEG_GRANTEE --role restore        # add --until 7d for a time-limited share

# the grantee restores on THEIR fresh host, with their own key
export REEG_HOME=/tmp/host-c
export REEG_OPERATOR=$REEG_GRANTEE
reeg restore $M --dest /tmp/restored-c
```
**You'll see:** `Granted restore access…`, then the grantee's `Restored…` with the **same root
hash** — a second person, second machine, same environment.

**The punchline — revoke and watch them get denied:**
```sh
export REEG_OPERATOR=<OPERATOR>; export REEG_HOME=/tmp/host-b
reeg revoke $M $REEG_GRANTEE

export REEG_OPERATOR=$REEG_GRANTEE; export REEG_HOME=/tmp/host-c
reeg restore $M --dest /tmp/restored-c2          # this now FAILS: access denied
```
**You'll see:** `Revoked access…`, then the grantee's restore fails with a clean
`error: …` access-denied line. (Revoke is forward-looking.)

### Beat 6 — Prove it, Reeg switched off *(the hero shot)*

```sh
export REEG_OPERATOR=<OPERATOR>; export REEG_HOME=/tmp/host-b
reeg verify $M
```
**You'll see:** `Verified: 0x…` then named checks — `ok  provenance-head …`,
`ok  checkpoint-count …`, `ok  sequence-contiguous …`, `ok  current-blob-id …`,
`ok  manifest-hash …` — and exit 0. It reads **only public Sui** (no signer, no Reeg backend).
**On screen:** *Reeg switched off. Still provable. The truth was never in our hands.*

> **The "54/54" decision.** `reeg verify` prints the named `ok` checks above, **not** "54/54."
> "54/54" is the `@reeg/verify` *unit-test suite* count. So either:
> - film **`reeg verify $M`** → caption it with the named checks (most honest "live proof"), **or**
> - film the **test runner** (`pnpm --filter @reeg/verify test`) → that's where "54/54" comes from.
> Don't put "54/54" under the `reeg verify` output — they're different artifacts.

### Beat 7 — it's real on mainnet *(read-only explorer shot)*

Open a Sui explorer to the **mainnet** package `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`.
Do **not** run a restore on mainnet. If you have a real mainnet machine id with a checkpoint,
you *may* run read-only:
```sh
reeg verify <mainnetMachineId> --network mainnet --package 0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e
```
Pair with the green-CI montage: Move 40/40, `@reeg/verify` 54/54, Firecracker 8/8 on a real AWS KVM host.

---

## Pre-shoot checklist (tick these the day before)

- [ ] Sui CLI 1.73.x and Walrus CLI installed and on PATH.
- [ ] `reeg` runs (or you've confirmed the `pnpm --filter @reeg/cli exec reeg` fallback).
- [ ] Both addresses created, **both funded** with SUI **and** WAL (`sui client gas` shows coins for each).
- [ ] A **working** testnet faucet confirmed (the one likely snag).
- [ ] `live:acceptance` passes end-to-end (proves the whole story works on your machine).
- [ ] `REEG_PACKAGE_ID` confirmed live via a `reeg verify` of a known testnet machine.
- [ ] Decided what the hero shot films (live `reeg verify` vs. the test runner for "54/54").
- [ ] Recording at a readable font size; machine id stored in `$M` so it's not retyped.

## If something breaks on camera

- **`error: a package id is required`** → `REEG_PACKAGE_ID` not exported (Part B).
- **`error: an operator address is required`** → `REEG_OPERATOR` not exported.
- **`no Ed25519 key for <address>`** → that address's key isn't in `~/.sui/sui_config/sui.keystore` (re-create/import it).
- **`reeg: command not found`** → use `pnpm --filter @reeg/cli exec reeg <verb>`.
- **restore fails on mainnet** → expected; film restore on **testnet** only.
- **`reeg-engine not found`** → `export REEG_ENGINE=engine/target/debug/reeg-engine` (and build it).
- Set `REEG_DEBUG=1` to see full stack traces while rehearsing.
