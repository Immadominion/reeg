# Agent access: Sign in with Reeg, delegated keys, sponsored gas, and the Reeg MCP

How a real customer uses Reeg without running a Rust CLI or holding a crypto wallet. This is the
architecture that turns Reeg from "an operator tool" into a product you can hand to a client or point
an agent at. None of it is built yet; this doc is the design and the provisioning checklist.

Reeg is infrastructure for portable computing environments. We started with AI agents because they're
the fastest-growing source of ephemeral work, but the underlying system can preserve and move any
environment. Agents are the wedge for that broader category, not the ceiling. This doc covers the
agent-access path specifically, but the same identity, delegation, and sponsorship model serves any
environment a user runs.

## Why this exists

Today the SDK and CLI sign with a **local keystore**: the operator holds a Sui address funded with SUI
and WAL, runs the engine, and pays for every checkpoint themselves. That is fine for a developer running
their own runs. It breaks the moment the real usage pattern shows up:

- A team buys Reeg and lets **their agents** do the work; the agents should not manage seed phrases.
- A consultancy runs Reeg **for clients**; the client should sign in like they sign in to Vercel, not
  fund a wallet.
- Nobody outside crypto will top up SUI and WAL to use a product.

So Reeg needs three things it does not have: an **identity** (sign in with Reeg), a way for an **agent to
act on a user's behalf** without their full key, and someone other than the end user to **pay** for the
chain costs. The Sui stack (Enoki + Seal + the existing Move objects) maps onto all three.

## The model in one picture

```
  Browser (Console)                    Agent (anywhere: CI, a server, Claude Code)
  ─────────────────                    ───────────────────────────────────────────
  Sign in with Reeg                    calls the Reeg MCP / SDK with a delegated,
   = Enoki zkLogin (Google/email)       time-limited credential for one agent account
        │                                         │
        ▼                                         ▼
   Reeg account (a Sui address, no seed)   agent account (a scoped Sui sub-address
        │   authorizes an agent ───────────▶      the user controls via Reeg)
        ▼                                         │  creates/checkpoints Machines it owns
   ── Reeg paymaster (a backend) ───────────────────────────────────────────────
     • gas: Enoki gas station sponsors Sui tx (only Reeg's package functions)
     • storage: a Reeg-funded signer pays WAL on Walrus for the blob
     • metering: counts checkpoints/bytes/epochs → bills the customer in fiat
  ──────────────────────────────────────────────────────────────────────────────
        │
        ▼
   Verification stays BACKEND-FREE: anyone still verifies the history offline from
   public Sui + Walrus alone. Reeg is a paymaster and a convenience, never a trusted
   party for what the agent did.
```

## 1. Sign in with Reeg = Enoki zkLogin

Use Mysten's **Enoki** zkLogin. The user signs in with Google / Apple / email in the Console; Enoki
returns a **Sui address derived from their OAuth identity** with no seed phrase. That address is their
Reeg account. This is literally "Sign in with Vercel," for Reeg.

- Frontend: `@mysten/enoki` in `apps/console`, behind a `ReegLogin` component, alongside the existing
  dapp-kit wallet connect (power users can still bring their own wallet).
- The Console stores the zkLogin session (ephemeral key + proof, valid for a bounded epoch window).

## 2. The agent account + delegated keys (blast-radius isolation)

An agent must act autonomously, so it needs a key it can sign with. **Do not hand the agent the user's
main key.** Instead:

- On first use, Reeg provisions a per-user **agent account**: a separate Sui address used *only* for
  agent work. It owns the agent's Machines. The user controls it through their Reeg login.
- The agent receives a **scoped, time-limited credential** for that account: an ephemeral keypair +
  zkLogin proof valid for a short epoch window (Enoki-issued), or a dedicated agent keypair the user
  authorizes. Either way it is revocable and expires.
- Because it is a separate account, a leaked agent credential can touch *only* the agent's Machines and
  the sponsored budget, never the user's other assets. That isolation is the whole point.

Revocation is immediate (drop the credential / let the window lapse) and, for shared environments, the
existing `AccessPolicy` `revoke` still applies forward-looking.

## 3. Sponsorship: who pays

Two separate costs, two separate sponsors, both fronted by Reeg and billed back:

- **Sui gas → Enoki gas station (sponsored transactions).** Enoki *manages* the sponsor key and gas
  pool: there is no self-held sponsor wallet; Reeg funds a budget through the Enoki portal (fiat) and
  allowlists *only its own package's functions* (`create`, `checkpoint` anchor, `grant`, `fork`, …).
  The agent signs the transaction kind; Enoki's sponsor signs and pays the gas. Allowlisting the
  package functions doubles as a spend guard: only Reeg operations are ever sponsored.
- **Walrus storage (WAL) → a Reeg-funded storage signer.** The checkpoint's blob write is paid by a
  Reeg-controlled signer (server side), not the agent. `packages/storage` currently takes a `Signer`
  in `StoreOptions`; the sponsored path routes that signer to the Reeg paymaster instead of the user.
  This is the piece that requires a small Reeg backend (an agent cannot hold the WAL-paying key).

The end user/agent holds **no SUI and no WAL**. Today, by contrast, the operator's wallet pays both,
through the public Mysten mainnet upload-relay (`upload-relay.mainnet.walrus.space`).

## 4. The Reeg MCP (the agent's interface)

A Model Context Protocol server (`@reeg/mcp`) so any agent (Claude Code, a custom agent, an IDE) calls
Reeg operations as tools. This is how "the agent does the work and it's reeged" actually happens.

- Tools wrap `@reeg/sdk`: `reeg_create`, `reeg_checkpoint`, `reeg_restore`, `reeg_verify`,
  `reeg_share` (grant/revoke), `reeg_fork`, `reeg_retire`, `reeg_evidence`, `reeg_list`, `reeg_get`.
- Auth: the MCP is configured with the agent's delegated credential + the network; write tools sign with
  it and are gas/storage-sponsored. Read/verify tools (`reeg_verify`, `reeg_get`, `reeg_list`,
  `reeg_audit`) need no credential and work offline against public Sui + Walrus.
- `reeg_checkpoint`/`reeg_restore` still need the local engine binary (they pack/unpack the working
  directory); the MCP shells to it like the CLI does, and degrades to chain-only tools where it is absent.

This is the **first buildable brick**: the read/verify tools work today with zero new infrastructure.

## 5. Metering and billing

Reeg meters what it sponsors (checkpoints, bytes, epochs, gas) and bills the customer in fiat/credits
with margin, the usage-based model already in [../05-business/business-model.md](../05-business/business-model.md).
Customer pays Reeg dollars; Reeg pays the chain. Add per-account sponsorship caps to bound abuse.

## 6. The invariant boundary (load-bearing)

Reeg gains a **backend** for three things and only three: identity (Enoki), sponsorship (gas + storage),
and metering/billing. It does **not** gain a role in **verification**. The core invariant holds: anyone
verifies a past run **offline from public Sui + Walrus alone**, with every Reeg service stopped. So a
customer trusts Reeg as a paymaster and a convenience, which it cannot use to forge, hide, or rewrite
what an agent did. If a design ever makes verification depend on the Reeg backend, the design is wrong.

## 7. What you must provision (only you can do these)

> **Plan note (verified 2026-06-13).** Enoki's **free (Sandbox) plan is testnet/devnet only**: no
> mainnet apps, no mainnet sponsorship. Build and prove the whole flow on **testnet for free**; going
> to mainnet is a billing step, not a rebuild: mainnet sign-in needs Enoki **Starter (~$69/mo)** and
> sponsored mainnet gas needs **Professional (~$120/mo)** or the **sponsored-transactions bundle**.

1. **Enoki account + API keys** (enoki.mystenlabs.com): a **public** key for the frontend (zkLogin,
   `enoki_public_…`) and a **private** key for the backend (sponsored transactions, `enoki_private_…`,
   server env only). Configure the allowed package + functions on the private key.
2. **OAuth client IDs** for zkLogin providers (at least Google: a "Web application" OAuth client),
   registered with Enoki under Auth Providers.
3. **An Enoki budget for Sui gas**: Enoki *manages* the sponsor pool (no self-held keypair); you fund
   a budget in the portal (mainnet = paid plan). Testnet gas is free.
4. **A funded Reeg storage wallet** for Walrus: a real backend Ed25519 keypair (a server secret, not a
   browser wallet) that signs blob writes, holding WAL (+ a little SUI). Testnet: fund free via faucet +
   `walrus get-wal`. Mainnet: buy WAL (DEX/CEX) and send it to the address.
5. A minimal **backend host** for the paymaster + metering (the only privileged service; keep it small).

## 8. Build sequence

1. ~~**Reeg MCP** (`@reeg/mcp`)~~: **DONE.** All 13 verbs are MCP tools; `reeg_verify` / `reeg_get` /
   `reeg_list` are proven against **live mainnet** (backend offline), write tools sign with the local
   keystore today. See [`packages/mcp`](../../packages/mcp/README.md).
2. **Sign in with Reeg** (Enoki zkLogin) in the Console: needs the Enoki public key + Google OAuth.
3. **Sponsored gas** (Enoki gas station) for Reeg's package functions: needs the Enoki budget (paid on
   mainnet) + the package-function allowlist.
4. **Sponsored storage** (the paymaster signer for WAL): needs the storage wallet + the small backend.
5. **Agent credential issuance + metering/billing**: the scoped-key flow and the usage meter.

Steps 2–5 depend on provisioning; step 1 is done. The MCP's write tools swap their local-keystore
signer for the delegated/sponsored signer at steps 3–5 without changing any tool surface.
