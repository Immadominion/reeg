# Demo Runbook (operational)

The step-by-step for running the Reeg demo live, on testnet. The narrative and timing are in
[demo-script.md](demo-script.md); this is the "what to type and click" companion so the run is
boring and repeatable. The whole point: **kill the host, restore elsewhere, verify with the Reeg
backend off** — and now fork a good run in the Console with one click.

## 0. Prerequisites (once, before demo day)

- Node 24, pnpm 10, Rust 1.95, the Sui + Walrus CLIs. Build the engine:
  `cargo build --manifest-path engine/Cargo.toml` → `engine/target/debug/reeg-engine`.
- Two funded **testnet** addresses in the Sui keystore: an operator and a grantee (request testnet
  SUI from the faucet; a little WAL for Walrus storage).
- A wallet (Sui Wallet / Slush) on **testnet**, holding the operator address, for the Console.
- Env for the CLI loop:
  ```sh
  export REEG_ENGINE=engine/target/debug/reeg-engine
  export REEG_PACKAGE_ID=0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28
  export REEG_OPERATOR=<your testnet operator address>
  export REEG_GRANTEE=<a second testnet address>
  ```
- Console env (`apps/console/.env.local`), pointing at the same package:
  ```sh
  VITE_REEG_NETWORK=testnet
  VITE_REEG_PACKAGE_ID=0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28
  ```
- Rehearse the full sequence end to end at least twice. Pre-stage one environment with a couple of
  snapshots so the Console has real history to show immediately.

## 1. Smoke test (the morning of)

Run the scripted acceptance loop — if it's green, the demo will work:
```sh
pnpm --filter @reeg/test run live:acceptance
```
It does the whole thing hermetically (create → run → checkpoint → kill host A → restore on a fresh
host B → grant → grantee restores on host C → revoke → verify offline) and asserts byte-identical
restores. Green here = green on stage.

Start the Console: `pnpm --filter @reeg/console run dev`, connect the operator wallet.

## 2. Live sequence

1. **It's a real environment** — in a terminal, create and use one:
   ```sh
   reeg create                                   # -> prints the environment id
   reeg run <id> -- sh -c 'mkdir -p src && echo "fn main(){}" > src/main.rs'
   reeg run <id> -- sh -c 'echo "progress" >> NOTES'
   reeg checkpoint <id>                          # encrypt -> Walrus -> anchor on Sui
   ```
   Open the id in the Console (paste into "Open an environment"). Show the **History** timeline —
   the snapshot is there, with no blockchain jargon.

2. **The undeniable moment (portability)** — destroy the host, restore on a clean one:
   ```sh
   rm -rf <the working dir>                       # the agent's machine is gone
   reeg restore <id> --dest ./restored            # rebuilt from Sui + Walrus alone
   diff -r <original> ./restored                  # byte-identical
   ```
   The Console's **Recover on another machine** panel shows this exact command — restore rebuilds the
   working directory on any host (it's a host operation, not a browser trick).

3. **Prove it (offline)** — in the Console, click **Verify independently**. It reads only Sui +
   Walrus, client-side. **Stop the Reeg backend / disconnect any Reeg service first** to make the
   point: the green "Verified independently" still appears. Nothing trusts a Reeg server.

4. **Own and branch it (fork)** — as the owner, click **Fork this environment** in the Actions panel.
   Approve the wallet transaction. The Console opens the new child environment; its History shows the
   lineage back to the parent. (One on-chain action, no terminal.)

5. **Share and revoke** — in the Share panel, add the grantee by address, role "Can restore". Show
   them appearing. Then revoke. (Optional: have the grantee restore via CLI between grant and revoke,
   using the acceptance flow, to show access actually works and then stops.)

## 3. Fallbacks

- **Network flaky / RPC slow:** have a pre-recorded screen capture of step 2 (kill → restore →
  diff) and step 3 (Verify offline) ready to play. The acceptance script's output is also a credible
  fallback artifact.
- **Wallet won't connect:** the Verify button needs no wallet — you can still open any environment id
  and verify. Fork/Share need the owner wallet; if it's down, narrate them from the pre-staged env.
- **Fork tx rejected/slow:** the Console shows "Forking…" then either opens the child or falls back to
  Home where the new child appears in the owned list. Refresh and open it.

## 4. What is real vs. host-side (be honest if asked)

- **In the Console (browser):** read history, **Verify** offline, **Fork** (on-chain), **Share/Revoke**
  (on-chain). All real, all signed with your wallet, none need a Reeg backend.
- **On a host (CLI):** run the agent, checkpoint, and **restore** — because restore rebuilds a real
  working directory and re-runs the agent, which a browser can't do. The Console hands you the exact
  command. This split is the honest architecture, not a missing feature.
