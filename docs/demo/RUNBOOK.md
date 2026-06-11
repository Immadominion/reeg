# Demo Runbook (operational)

The step-by-step for running the Reeg demo live. The narrative and timing are in
[demo-script.md](demo-script.md); this is the "what to type and click" companion so the run is
boring and repeatable. The whole point: **own a Machine, share it, kill the host and move it
elsewhere byte-identically, and prove all of it OFFLINE with the Reeg backend off** — plus, if you
have the Nitro host, prove *which code* produced a checkpoint.

Reeg's tagline: **"The computer your AI agents live in. Own it, share it, move it, prove it."**

> **Networks.** Reeg is **LIVE ON SUI MAINNET**. Everything except *decrypt-on-restore* works on
> mainnet today: create, Seal-encrypt, store on Walrus, anchor on Sui, **offline verify**, and the
> **Nautilus attestation** tier. The full encrypted **checkpoint → restore → verify** loop is proven
> end-to-end on **testnet** — see the honest constraint in §5. For a clean judge run, do the
> encrypted *round-trip* steps on testnet and the *mainnet is real* + *attestation* steps on mainnet.

## 0. Prerequisites (once, before demo day)

- Node 24, pnpm 10, Rust 1.95, the Sui + Walrus CLIs. Build the engine:
  `cargo build --manifest-path engine/Cargo.toml` → `engine/target/debug/reeg-engine`.
- Two funded addresses in the Sui keystore on **each network you'll demo**: an operator and a
  grantee. On testnet, request SUI from the faucet plus a little WAL for Walrus. On mainnet, the
  operator needs a little SUI + WAL (measured cost below — it's tiny).
- A wallet (Sui Wallet / Slush) holding the operator address, for the Console. Set its network to
  match the env you open.
- Package ids (real, verified this session):
  - **Mainnet:** `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`
    (upgraded from the original `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3`
    via Sui package upgrade to add the attestation module).
  - **Testnet:** `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.
- Env for the CLI loop (testnet round-trip shown; swap the package id + `--network mainnet` for the
  mainnet steps):
  ```sh
  export REEG_ENGINE=engine/target/debug/reeg-engine
  export REEG_PACKAGE_ID=0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2
  export REEG_OPERATOR=<your testnet operator address>
  export REEG_GRANTEE=<a second testnet address>
  ```
- Console env (`apps/console/.env.local`), pointing at the same package:
  ```sh
  VITE_REEG_NETWORK=testnet
  VITE_REEG_PACKAGE_ID=0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2
  ```
- **Cost note for judges (mainnet, measured):** create + encrypted checkpoint (1 epoch, including the
  Walrus upload-relay tip) ≈ **0.0099 SUI + 0.0119 WAL**. (For reference: package publish ≈ 0.047 SUI;
  upgrade ≈ 0.05 SUI.) A full demo on mainnet costs cents.
- Rehearse the full sequence end to end at least twice. Pre-stage one environment with a couple of
  checkpoints so the Console has real history to show immediately.

## 1. Smoke test (the morning of)

Run the scripted acceptance loop — if it's green, the demo will work:
```sh
pnpm --filter @reeg/test run live:acceptance
```
It does the whole thing hermetically (create → run → checkpoint → kill host A → restore on a fresh
host B → verify offline → grant → grantee restores on host C → revoke → denied) and asserts
byte-identical restores. Green here = green on stage.

Start the Console: `pnpm --filter @reeg/console run dev`, connect the operator wallet.

## 2. Live sequence — own / share / move / prove

Each Reeg environment is a **Machine**: an object you own on Sui, its filesystem + optional agent
memory snapshotted to content-addressed blobs on Walrus, encrypted client-side with Seal, with a
hash-chained provenance log anchored on Sui that anyone can verify offline.

1. **OWN — it's a real environment you own on-chain.** In a terminal, create and use one:
   ```sh
   reeg create                                   # -> prints the Machine (environment) id
   reeg run <id> -- sh -c 'mkdir -p src && echo "fn main(){}" > src/main.rs'
   reeg run <id> -- sh -c 'echo "progress" >> NOTES'
   reeg checkpoint <id> --epochs 1               # Seal-encrypt -> Walrus -> anchor on Sui
   ```
   The Machine is an **owned** Sui object on the fast path — the owner alone mutates it. The
   checkpoint is **Seal-encrypted client-side before it ever touches Walrus**. Open the id in the
   Console (paste into "Open an environment"). Show the **History** timeline — the checkpoint is
   there, with no blockchain jargon.

2. **MOVE — the undeniable moment (portability).** Destroy the host, restore on a clean one:
   ```sh
   rm -rf <the working dir>                       # the agent's machine is gone
   reeg restore <id> --dest ./restored            # rebuilt from Sui + Walrus alone
   diff -r <original> ./restored                  # byte-identical
   ```
   Restore is **content-addressed (BLAKE3 CAS) + deterministic**, so it rebuilds byte-identically on
   *any* host — and across runtime tiers, because a canonical umask is pinned so captured file modes
   don't leak the ambient login umask. The Console's **Recover on another machine** panel shows this
   exact command (it's a host operation, not a browser trick). To branch instead of just restore,
   `reeg fork <id> --from <checkpoint>` creates a child Machine with provable on-chain lineage to the
   parent.

3. **PROVE — offline, no Reeg backend.** In the Console, click **Verify independently**. It reads only
   Sui + Walrus, client-side. **Stop the Reeg backend / disconnect any Reeg service first** to make
   the point: the green "Verified independently" still appears. The provenance head on the Machine is
   hash-chained, append-only, and tamper-evident; nothing trusts a Reeg server. (CLI equivalent:
   `reeg verify <id>`; `reeg evidence` / `reeg audit` export a portable evidence file an auditor
   keeps.)

4. **OWN + branch it (fork) in the Console.** As the owner, click **Fork this environment** in the
   Actions panel. Approve the wallet transaction. The Console opens the new child Machine; its History
   shows the lineage back to the parent. (One on-chain action, no terminal.)

5. **SHARE and revoke.** Sharing is real access control, not a UI toggle: a shared **AccessPolicy**
   object holds grants, and grant/revoke append **GRANT/REVOKE** entries to the same provenance chain.
   In the Share panel, add the grantee by address, role "Can restore" — show them appearing — then
   revoke. Grants are an allowlist with time-limited expiry; **revocation is forward-looking** (it
   cannot un-see data someone already decrypted). The Seal threshold is set at **encryption** time
   (`reeg checkpoint --threshold t`). (Optional: have the grantee restore via CLI between grant and
   revoke, using the acceptance flow, to show access actually works and then stops.)

## 3. Attestation demo — PROVE *which code* (Nautilus tier, optional)

This is the optional **Nautilus TEE attestation tier**, **LIVE on testnet and mainnet**. It proves
*which code* produced a checkpoint. It is **strictly additive**: a non-attested run is byte-identical,
and the enclave **attests results — it does not run the agent** (the agent stays in the Firecracker VM,
preserving portability + offline verify).

- **On the AWS Nitro host** (the enclave is a tiny reproducible musl-static `.eif`, ~6.5MB; two
  cache-cleared rebuilds produce **identical PCRs**):

  ```sh
  reeg enclave register --network mainnet        # verifies the Nitro doc on-chain, pins PCRs + key
  reeg checkpoint <id> --attest --enclave-config <cfg>   # signs the manifest hash over a frozen preimage
  ```

  `register_enclave` verifies the Nitro attestation document via `0x2::nitro_attestation` and pins the
  PCRs + ed25519 key into a shared **EnclaveConfig** (once per build). `register_attested_command`
  cheaply ed25519-verifies each per-checkpoint signature and emits `CommandAttested`.
- **Anywhere (offline) — the payoff judges can reproduce:** the `@reeg/verify` verifier confirms the
  signature **and** that the PCRs match the trusted reproducible build (it flags all-zero debug-mode
  PCRs). Live EnclaveConfigs verified offline **4/4 on both networks** this session. Show this with the
  Reeg backend off — it's public Sui data plus a known-good build measurement.

## 4. Fallbacks

- **Network flaky / RPC slow:** have a pre-recorded screen capture of step 2 (kill → restore → diff)
  and step 3 (Verify offline) ready to play. The acceptance script's output is also a credible
  fallback artifact.
- **Wallet won't connect:** the Verify button needs no wallet — you can still open any environment id
  and verify. Fork/Share need the owner wallet; if it's down, narrate them from the pre-staged env.
- **Fork tx rejected/slow:** the Console shows "Forking…" then either opens the child or falls back to
  Home where the new child appears in the owned list. Refresh and open it.
- **No Nitro host on the day:** §3 needs an AWS Nitro box. If you don't have it live, narrate from a
  pre-recorded `@reeg/verify` run against the already-registered live EnclaveConfigs (4/4 on both
  networks) — the offline verification is the part that matters and it's reproducible.

## 5. What is real vs. host-side, and the one honest constraint (be honest if asked)

- **In the Console (browser):** read history, **Verify** offline, **Fork** (on-chain), **Share/Revoke**
  (on-chain). All real, all signed with your wallet, none need a Reeg backend.
- **On a host (CLI):** run the agent, **checkpoint**, **restore**, and (on a Nitro box) **attest** —
  because restore rebuilds a real working directory and re-runs the agent, which a browser can't do.
  The TS CLI shells to the Rust engine (`reeg-engine`) for snapshot/restore and the enclave vsock
  client. The Console hands you the exact command. This split is the honest architecture, not a missing
  feature.
- **Runtime tiers (host-side, all share one capture+verify path):** local (dev, no isolation); an **OCI
  container** tier (runc, read-only rootfs, per-session tmpfs `/work`, network isolation proven by an
  unreachable metadata service); and a **Firecracker microVM** tier (KVM kernel-boundary isolation,
  in-guest agent over vsock). Phase M hardening is **19/19 complete on a real AWS KVM host**, including
  running the Firecracker VMM **under the jailer** (chroot + dropped privileges to an unprivileged
  uid/gid + cgroup v2). The Firecracker/OCI/jailer/Nautilus tiers require a Linux KVM + Nitro host; the
  local tier plus the full own/share/move/prove chain run anywhere.
- **The one honest constraint — Seal decrypt on mainnet.** A Seal-**encrypted** checkpoint on
  **mainnet** needs a mainnet Seal key server. Mainnet currently has **no free public Open-mode Seal
  key server** (the decentralized committee server is "available soon"; independent providers run
  Permissioned mode requiring signup, and the Ruby Nodes free-tier key currently returns 403 from their
  API gateway — a provider-side activation matter, not Reeg's code). So on **mainnet**: encryption +
  storage + anchor + **offline verify** + **attestation** all work; only **decrypt (restore)** waits on
  a working provider key server. The full encrypted **checkpoint → restore → verify** loop is proven on
  **testnet** — which is why this runbook does the round-trip there. State this plainly; it's a
  third-party availability gap, not a Reeg limitation.

## 6. Compliance framing (positioning, not legal advice)

Reeg's tamper-evident provenance maps to the **EU AI Act Art. 12** (record-keeping / logs): an
append-only, hash-chained log with configurable Walrus retention (`--epochs`; ~6 months ≈ 13 testnet
epochs), and `reeg evidence` / `reeg audit` export a portable evidence file an auditor keeps. Keep the
claim honest — this is aspirational positioning, not legal advice.
