# For Ubadineke: Reeg, end to end

Hey. This is the context dump + exact steps so you can get Reeg running on your M4, see what's
built, and (if you're up for it) help unblock the two phases I can't do on my M2. There's a
ready-to-paste prompt for your AI at the bottom. Read this top to bottom once; it's the whole map.

## What Reeg is

Reeg makes each AI-agent environment a **Machine you own on Sui**, backed by content-addressed data
on **Walrus**, encrypted client-side with **Seal**, so a run can be **shared, forked, moved across
hosts, and independently verified, with the Reeg backend offline.** Think: the computer your agents
live in, that you own and can prove.

The one invariant the whole thing rests on: **verifying a past run never requires a live or honest
Reeg service.** Verification reads only public Sui + Walrus. The Console is a static site; the
indexer is rebuildable and never on the trust path. If you remember one thing, remember that.

## What's already built and proven (on Sui testnet)

The full operator loop runs today, driven by the `reeg` CLI, and is covered by tests at every layer:

- **create → run → checkpoint → restore → fork → verify**: restore is byte-identical; verify
  passes on public data alone.
- **Sharing**: `grant`/`revoke` (+ time-limited grants) via a shared `AccessPolicy` object the Seal
  key servers read; a grantee decrypts and restores; revoke denies the next attempt. Grant/revoke
  are recorded in the provenance chain and verify offline.
- **Cross-host portability**: checkpoint on one host, **kill it**, restore byte-identically on a
  fresh host that never saw it, from Sui + Walrus alone. There's a scripted acceptance demo.
- **Compliance / evidence (EU AI Act Art. 12)**: `reeg evidence` exports a portable file an auditor
  verifies **fully offline** with `reeg audit` (and `--anchor` re-confirms it against live Sui).
  Tamper-evident: editing the file fails the check.
- **Agent memory**: a memory dir is captured into the checkpoint bundle, restored on any host, and
  bound into the manifest hash (so it's verified with the environment). MemWal-agnostic.
- **Retirement**: `reeg retire` writes a permanent, verifiable end-of-life marker (the retention
  anchor for compliance).

Test counts as of this push: **Move 34, Rust engine ~23, TypeScript ~131**, plus lint/typecheck
clean. The current testnet package id is in [config/testnet.json](config/testnet.json).

## What's NOT done: where you can help

Two phases are blocked on hardware I don't have:

- **Phase M: Firecracker microVM isolation tier.** Needs `/dev/kvm` (Linux KVM). **My M2 cannot do
  this** (Apple only exposes nested virtualization on **M3 and newer**, so a Linux VM on an M2
  can't get KVM). **Your M4 can** (macOS 15+ via Lima, experimental), or we use a cheap cloud Linux
  box. The work: implement a `FirecrackerRuntime` behind the existing `Runtime` trait and prove the
  loop runs inside a real microVM.
- **Phase N: Nautilus attested execution.** Needs an **AWS Nitro Enclave** (AWS-only hardware; no
  local option, even on M4). The work: build the reproducible enclave, register its PCRs on Sui
  testnet, and wire enclave-signed attestations into provenance.

Neither needs **mainnet**: both develop on **testnet** (gas is free via faucet).

## Repo map

| Path | What | Language |
| --- | --- | --- |
| [move/](move/) | on-chain Machine object, provenance hash-chain, `seal_approve` policies | Move 2024 |
| [engine/](engine/) | snapshot/restore engine + runtime adapter (`reeg-engine` binary) | Rust |
| [packages/](packages/) | `@reeg/chain`, `storage`, `crypto`, `sdk`, `verify`, `cli` | TypeScript |
| [apps/](apps/) | `console` (static Walrus Site) + `indexer` (display-only) | TypeScript/React |
| [config/](config/) | per-network config (testnet/mainnet) | JSON |
| [scripts/](scripts/) | `publish-package.sh`, `aws-dev-host.sh` (provisions the M+N host) | shell |
| [docs/](docs/) | the full product + architecture + engineering docs | Markdown |

**Read these, in order, for context:** [docs/ai/AGENTS.md](docs/ai/AGENTS.md) (source of truth) →
[README.md](README.md) → [docs/03-engineering/build-roadmap.md](docs/03-engineering/build-roadmap.md)
(phases A–O, with done-bars) → [docs/02-architecture/system-architecture.md](docs/02-architecture/system-architecture.md).
Phase-specific: [sharing-design.md](docs/03-engineering/sharing-design.md),
[cross-host-portability.md](docs/03-engineering/cross-host-portability.md),
[compliance-evidence.md](docs/03-engineering/compliance-evidence.md),
[agent-memory.md](docs/03-engineering/agent-memory.md).

## Reproduce it on your M4 (no funds needed)

Prerequisites:
```sh
# Node 24 + pnpm 10
node --version            # need >= 24 (see .node-version); nvm/fnm if needed
corepack enable && corepack prepare pnpm@10 --activate
# Rust (stable, see rust-toolchain.toml)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Sui CLI (for the Move package)
brew install sui          # or: cargo install --locked --git https://github.com/MystenLabs/sui sui
```

Build + run the whole test suite (all offline, no testnet, no money):
```sh
git clone https://github.com/Immadominion/reeg && cd reeg
cp .env.example .env                                   # placeholders; fill only if going live
pnpm install
pnpm build
pnpm test                                              # TypeScript unit + integration tests
cargo test --manifest-path engine/Cargo.toml --workspace   # Rust engine
sui move test --path move                              # Move package + conformance vectors
pnpm lint && pnpm -r run typecheck                     # should be clean
```
If those are green, you've reproduced everything that doesn't need testnet. The offline evidence
audit (`reeg audit`) is exercised by the test suite: that's the compliance proof working with no
network at all.

Going live (optional, needs a funded **testnet** address, never mainnet, never a real-money key):
get testnet SUI from the Sui faucet, get a little WAL, then point `REEG_ENGINE` at the built engine
and run the loop or the acceptance demo. See the "Live on testnet" section of [README.md](README.md).
Generate a **fresh** testnet keypair for this. Don't reuse anything that holds real funds.

## If you want to help unblock M or N

**Option A: your M4, local Firecracker (Phase M, free, experimental).** On macOS 15+ an M4 can
expose `/dev/kvm` inside a Linux VM via Lima with nested virtualization:
```sh
brew install lima
limactl start --vm-type=vz --set='.nestedVirtualization=true' template://ubuntu
limactl shell <vm> bash -lc 'ls -l /dev/kvm && ([ -r /dev/kvm ] && [ -w /dev/kvm ] && echo KVM-OK || echo KVM-FAIL)'
```
If `KVM-OK`, you can build/boot Firecracker there. It's reported-but-not-guaranteed on Apple silicon,
so validate a microVM actually boots before trusting it.

**Option B: one cheap AWS host for BOTH M and N (reliable).** There's a script that provisions an
8th-gen Intel instance with nested virtualization **and** Nitro Enclaves enabled (the only family
that does both), locked to your IP, ~$0.38/hr, stop/terminate when idle:
```sh
aws configure                          # an AWS account + access key
./scripts/aws-dev-host.sh up           # launch
./scripts/aws-dev-host.sh verify       # checks /dev/kvm (M) and a hello-world enclave (N)
./scripts/aws-dev-host.sh stop         # pause billing  |  down = terminate
```
Read the header of [scripts/aws-dev-host.sh](scripts/aws-dev-host.sh). It documents the fallback if
the enclave + nested-virt combo doesn't co-exist (run M and N on two instances).

## Security (please keep to these)

- **Never commit keys or `.env`.** `.gitignore` already excludes `.env`, `*.key`, `*.keystore`.
- **Never print or copy a private key.** The CLI signs from the local sui keystore in memory only.
- Use a **fresh testnet keypair** for any live runs; keep anything with real funds far away.
- testnet only for M/N; mainnet is a later, deliberate step.

---

## Prompt for your AI (paste this into Claude Code, run from the repo root)

> You are working in the Reeg repo (the agent-environment product described in this message). First,
> read for full context, in this order: `docs/ai/AGENTS.md` (the source of truth), `README.md`,
> `docs/03-engineering/build-roadmap.md` (phases A–O with done-bars), and
> `docs/02-architecture/system-architecture.md`. Then skim the phase docs in `docs/03-engineering/`
> (`sharing-design.md`, `cross-host-portability.md`, `compliance-evidence.md`, `agent-memory.md`) and
> `ubadineke.md` at the repo root.
>
> Current state: phases A–L plus an end-of-life `retire` feature are built and validated on Sui
> **testnet**; phases **M (Firecracker microVM isolation)** and **N (Nautilus / Nitro Enclave
> attested execution)** are not yet done because they need Linux `/dev/kvm` and an AWS Nitro Enclave
> respectively. Neither requires mainnet. Develop on testnet.
>
> Hard rules (do not break): (1) verifying a past run must never require a live or honest Reeg
> service: verification reads only public Sui + Walrus; (2) never print, copy, or commit any private
> key: sign from the local sui keystore in memory only, and use a fresh testnet keypair for live
> runs; (3) match the repo's voice in code/docs (no em dashes; comment the why, not the what; markdown
> links not inline-code filenames); (4) test everything and keep the build green.
>
> Step 1: verify the baseline is green: run `pnpm install && pnpm build && pnpm test`,
> `cargo test --manifest-path engine/Cargo.toml --workspace`, and `sui move test --path move`. Report
> anything red before changing code.
>
> Step 2: confirm which host you have. Run `[ -r /dev/kvm ] && [ -w /dev/kvm ] && echo KVM-OK || echo
> NO-KVM`. If you're on this Mac (M4) and want Firecracker, set up Lima with nested virtualization as
> in `ubadineke.md`; for a reliable host (and for Phase N), use `scripts/aws-dev-host.sh up` then
> `verify`.
>
> Step 3: implement **Phase M**: add a `FirecrackerRuntime` in the Rust engine implementing the same
> `Runtime` trait as `LocalRuntime` (see `engine/crates/runtime/src/`), so the capture/checkpoint/
> verify paths are unchanged. Prove the full loop (run a command, checkpoint, restore byte-identical,
> verify) executes inside a real Firecracker microVM against testnet. Add tests; keep the gate green.
> Then **Phase N**: follow `docs/03-engineering/build-roadmap.md` Phase N and the MystenLabs/nautilus
> guide: build the reproducible enclave, register its PCRs on testnet via
> `0x2::nitro_attestation::load_nitro_attestation`, and attach enclave-signed attestations to the
> provenance. Update the build-roadmap status and docs as you go.
>
> Work like a senior engineer: small, verified steps; live-test on testnet where it matters; surface
> anything that contradicts the docs instead of guessing.
