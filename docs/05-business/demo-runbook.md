# Reeg: Demo Runbook (exact steps to film the video)

> Companion to [demo-video-script.md](demo-video-script.md). This is the literal,
> copy-pasteable sequence to run Reeg yourself in a fresh environment and capture each beat.
> Every command here was taken from the actual CLI/source, not guessed. Where the repo
> genuinely doesn't pin something down, it's marked **⚠ confirm before camera day**. Handle
> those once, in advance, so nothing stalls while recording.

---

## Read this first (the 6 things that will bite you)

1. **Film on TESTNET, not mainnet.** The full loop, checkpoint → **restore (decrypt)** →
   verify, is proven end-to-end *only on testnet*. Mainnet decrypt is currently blocked (no
   free public Seal key server), so a restore on mainnet **will fail on camera.** Use mainnet
   only as a read-only "it's real" explorer shot.
2. **There is no `npm install` yet.** The `reeg` CLI is not published, so you build it from the
   repo (`pnpm install` → build), then make `reeg` a bare command with a shell **alias** pointing
   at the built file (see A2 / Part B). It is not otherwise on your PATH.
3. **You need TWO funded testnet addresses**: an **operator** (you, the owner) and a
   **grantee** (the teammate you share with). Both need a little testnet **SUI** (gas) **and**
   testnet **WAL** (storage), and both keys must live in your local Sui keystore.
4. **A "different machine" is a real teammate's laptop, or just a different folder.** With two
   people, your teammate's machine genuinely never saw the environment. Solo, simulate hosts with
   separate `REEG_HOME` directories (`/tmp/demo`, `/tmp/demo-b`, `/tmp/demo-c`): restoring into a
   fresh `REEG_HOME` *is* "bring it back on a machine that never saw it."
5. **`REEG_PACKAGE_ID` and `REEG_OPERATOR` are mandatory** for the on-chain commands: the CLI
   errors without them. They're in the export block below.
6. **The "54/54" in the script is the test-suite count, not what `reeg verify` prints.** Live,
   `reeg verify` prints ~5–7 named `ok` checks and exits 0. Decide which you film (see Beat 6).

---

## Part A: one-time setup (do this BEFORE camera day)

### A1. Install the toolchain (once, on your machine)

| Tool | Version | How |
| --- | --- | --- |
| Node | 24.5.0 (`.node-version`) | a version manager (`nvm install 24.5.0` / `fnm`) |
| pnpm | 10.33.1 | `corepack enable && corepack prepare pnpm@10.33.1 --activate` |
| Rust | 1.95 (auto-selected) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh -s -- -y` |
| Sui CLI | 1.73.1 | per Mysten docs (`suiup`, or cargo/brew), **⚠ not pinned in repo** |
| Walrus CLI | latest | per <https://docs.wal.app>, **⚠ not pinned in repo** |

### A2. Clone and build

```sh
git clone <YOUR-REEG-REPO-URL> reeg && cd reeg      # ⚠ supply the clone URL
corepack enable && corepack prepare pnpm@10.33.1 --activate
pnpm install                                        # installs workspaces; links the `reeg` bin
cargo build --manifest-path engine/Cargo.toml       # builds engine/target/debug/reeg-engine
pnpm -r build                                        # builds the CLI (packages/cli/dist/index.js) + the rest
```

The build produces the CLI at `packages/cli/dist/index.js`. It is **not** on your PATH, so make
`reeg` a bare command with an alias (cleanest on camera, so `reeg create` reads like a real install):

```sh
alias reeg="node $PWD/packages/cli/dist/index.js"   # run from the repo root; lasts this shell session
```

(Fallback if you'd rather not alias: `pnpm --filter @reeg/cli exec reeg <verb>`.)

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
export REEG_ENGINE="$PWD/engine/target/debug/reeg-engine"   # absolute path; run this from the repo root
pnpm --filter @reeg/test run live:acceptance
```

If that passes, every manual step below will work. (It throws a clear message if either
address isn't set/funded.) You can even film *this* as a clean, fast "it just works" cut.

---

## Part B: set up your filming shell

Open your terminal recording and paste this once, **from the repo root** (so the alias and `$PWD`
paths resolve). `reeg` becomes a bare command; `REEG_HOME` is where the environment's files live.

```sh
alias reeg="node $PWD/packages/cli/dist/index.js"          # `reeg` as a bare command
export REEG_ENGINE=$PWD/engine/target/debug/reeg-engine    # absolute, so it works from any folder
export REEG_NETWORK=testnet
export REEG_PACKAGE_ID=0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28
export REEG_OPERATOR=<OPERATOR>          # your address (key in the Sui keystore, funded SUI + WAL)
export REEG_GRANTEE=<GRANTEE>            # the teammate you'll share with
export REEG_HOME=/tmp/demo               # the environment lives in $REEG_HOME/machines/<id>/work
```

After you define the alias and absolute paths once from the repo root, you can run `reeg …` from
any directory for the rest of the session. (Fresh terminal = paste the block again.)

> **⚠ Package id — use the ORIGINAL (v1) package, not the upgraded one.** The testnet package was
> published as `0x4c86e0c4…` (v1) and later upgraded to `0x8f2faf0b…` (v2, which added Nautilus).
> **Seal encrypts under a package's *first* version and rejects an upgraded id** (`checkpoint`
> fails with *"Package 0x8f2faf0b… is not the first version"*). v1 already contains the full
> own/share/move/prove modules, so the whole demo loop works on it. Use the `0x4c86e0c4…` id above
> for filming. (`config/testnet.json` currently pins v2; set it to v1 too if you run
> `live:acceptance`, since that script reads the file.)

---

## Part C: the filmed sequence (each step = one beat)

> Tip: keep the machine id in a shell variable so you don't fat-finger it on camera:
> after `reeg create`, run `export M=<the 0x machineId it printed>`.

### Beat 1: Own it *(create the environment)*

```sh
reeg create
export M=0x…                              # the "Created environment 0x…" id it printed
W="$REEG_HOME/machines/$M/work"           # the environment's folder — what gets snapshotted
```
**You'll see:** `Created environment 0x…` + `policy:`, `workdir:`, `tx:`. The `workdir:` line is `$W`.
**On screen:** a Machine minted on-chain to *your* key. You own it.
**Two-person:** paste `$M` to your teammate now, it's public and it's all they need to restore.

### Beat 2: fill the environment *(the real "directory" you'll move)*

Reeg snapshots the environment's **own folder** — `$W` (`$REEG_HOME/machines/$M/work`, the
`workdir:` from Beat 1), **not** the directory your shell is in. So "snapshot my real project"
means: put a real project **into `$W`**, then checkpoint.

> **⚠ Checkpoint captures `$W` byte-for-byte, there is no `.reegignore`.** Whatever is in that
> folder goes into the (encrypted) snapshot and travels to anyone you grant. **Keep it small and
> clean:** no `node_modules`, no `.git`, no real `.env`/secrets, no `target/`/`dist`. A few KB to a
> few MB of real source is perfect; a full repo with `node_modules` would be hundreds of MB, slow
> to upload, and would stall on camera. (Your shell's project and your `~/.sui` keystore are never
> captured unless you copy them into `$W` yourself.)

**Option A, drop a real (small, clean) project in** (best for "it's my actual directory"):
```sh
rsync -a --exclude node_modules --exclude .git --exclude .env --exclude dist --exclude target \
  ~/path/to/a/small/project/  "$W/"
```

**Option B, build a believable project with a couple of clear commands** (no secrets at all):
```sh
reeg run $M -- bash -c 'echo "# Portable Environment Demo" > README.md'
reeg run $M -- bash -c 'mkdir -p src && printf "export const hello = () => \"this whole environment is portable\";\n" > src/index.ts'
```

Then show what you're about to snapshot:
```sh
ls -R "$W"
```
**On screen:** a real working directory, the environment your agent built up. (Filling it is local, no chain.)

### Beat 3: checkpoint *(snapshot → encrypt → Walrus → anchor on Sui)*

```sh
reeg checkpoint $M --epochs 1
```
**You'll see:** `Snapshot saved…` + `manifest:`, `blob:`, `bytes:`, `tx:`, a retention line, a
**cost** line, and `decryption: requires 1-of-1 Seal key server`. Spends a little testnet SUI + WAL.
**Caption the cost:** *~0.0099 SUI + ~0.0119 WAL per create + encrypted checkpoint (1 epoch).*

### Beat 4: Move it *(restore on a fresh host, byte-identical)*

Restoring into a fresh `REEG_HOME` proves the environment comes back on a host that never saw it.
Killing the original is optional drama, the restore is the proof.

```sh
cp -r "$W" /tmp/baseline                 # keep a copy so you can show a literal diff
rm -rf "$W"                              # (optional) the environment is now gone from this host
export REEG_HOME=/tmp/demo-b             # a fresh host
reeg restore $M --dest /tmp/restored-b
```
**You'll see:** `Restored 0x… into /tmp/restored-b` + a `manifest:`/`root:` matching the checkpoint.
The files reappear, byte-identical.
**Prove it on camera (the green "IDENTICAL"):**
```sh
diff -r /tmp/baseline /tmp/restored-b && echo IDENTICAL
```
> Or skip the diff and let the **matching root hash** from the restore output be the proof (what
> `live:acceptance` verifies with a deterministic tree hash).

### Beat 5: Share it *(grant a second address, they restore on their own host; then revoke)*

```sh
# you (the owner) grant your teammate restore rights
reeg grant $M $REEG_GRANTEE --role restore        # add --until 7d for a time-limited share
```
**You'll see:** `Granted restore access…`.

Then **your teammate restores on their own machine** (their setup from "Two-person" above, with
the `$M` you sent them):
```sh
reeg restore $M --dest ./restored                 # a second person, a second machine, same environment
```
> **One-machine fallback:** simulate the teammate with `export REEG_OPERATOR=$REEG_GRANTEE; export REEG_HOME=/tmp/demo-c` then `reeg restore $M --dest /tmp/restored-c`.

**The punchline: revoke and watch them get denied:**
```sh
export REEG_OPERATOR=<OPERATOR>; export REEG_HOME=/tmp/demo-b
reeg revoke $M $REEG_GRANTEE
```
Then the teammate's next restore **fails** with a clean access-denied error (one-machine sim:
`export REEG_OPERATOR=$REEG_GRANTEE; export REEG_HOME=/tmp/demo-c; reeg restore $M --dest /tmp/restored-c2`).
**You'll see:** `Revoked access…`, then the grantee's restore fails with a clean
`error: …` access-denied line. (Revoke is forward-looking.)

### Beat 6: Prove it, Reeg switched off *(the hero shot)*

```sh
export REEG_OPERATOR=<OPERATOR>; export REEG_HOME=/tmp/demo-b
reeg verify $M
```
**You'll see:** `Verified: 0x…` then named checks, `ok  provenance-head …`,
`ok  checkpoint-count …`, `ok  sequence-contiguous …`, `ok  current-blob-id …`,
`ok  manifest-hash …`, and exit 0. It reads **only public Sui** (no signer, no Reeg backend).
**On screen:** *Reeg switched off. Still provable. The truth was never in our hands.*

> **The "54/54" decision.** `reeg verify` prints the named `ok` checks above, **not** "54/54."
> "54/54" is the `@reeg/verify` *unit-test suite* count. So either:
> - film **`reeg verify $M`** → caption it with the named checks (most honest "live proof"), **or**
> - film the **test runner** (`pnpm --filter @reeg/verify test`) → that's where "54/54" comes from.
> Don't put "54/54" under the `reeg verify` output: they're different artifacts.

### Beat 7: it's real on mainnet *(read-only explorer shot)*

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
- [ ] `reeg` runs as a bare command (the `alias reeg="node $PWD/packages/cli/dist/index.js"` from Part B).
- [ ] Both addresses created, **both funded** with SUI **and** WAL (`sui client gas` shows coins for each).
- [ ] A **working** testnet faucet confirmed (the one likely snag).
- [ ] `live:acceptance` passes end-to-end (proves the whole story works on your machine).
- [ ] `REEG_PACKAGE_ID` confirmed live via a `reeg verify` of a known testnet machine.
- [ ] Decided what the hero shot films (live `reeg verify` vs. the test runner for "54/54").
- [ ] Recording at a readable font size; machine id stored in `$M` so it's not retyped.

## If something breaks on camera

- **`error: a package id is required`** → `REEG_PACKAGE_ID` not exported (Part B).
- **`error: an operator address is required`** → `REEG_OPERATOR` not exported.
- **`no Ed25519 key for <address>`** → that address's key isn't in `~/.sui/sui_config/sui.keystore` (re-create/import it). Also check you copied the **full** 66-char address (`0x` + 64 hex), not a truncated one.
- **`InvalidPackageError: … is not the first version`** (at `checkpoint`, inside `SealClient.encrypt`) → you're using the **upgraded** package id. Seal requires the package's **original/first** id. Use the v1 id `0x4c86e0c4…` (Part B) for both `REEG_PACKAGE_ID` and `config/testnet.json`.
- **`reeg: command not found`** → use `pnpm --filter @reeg/cli exec reeg <verb>`.
- **restore fails on mainnet** → expected; film restore on **testnet** only.
- **`reeg-engine not found`** (even after building it) → the path is **relative**, and `pnpm --filter`
  runs the script from the `test/` sub-package, so `engine/…` resolves to the wrong folder. Use an
  **absolute** path from the repo root: `export REEG_ENGINE="$PWD/engine/target/debug/reeg-engine"`
  (and build it first with `cargo build --manifest-path engine/Cargo.toml`).
- Set `REEG_DEBUG=1` to see full stack traces while rehearsing.
