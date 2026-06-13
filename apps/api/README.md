# @reeg/api — the Reeg paymaster

The only privileged Reeg service. Today it sponsors **Sui gas** for Reeg's own package functions
through Enoki's managed gas pool, so an end user or agent never holds SUI. Next: zkLogin helpers,
sponsored **Walrus storage** (a server-held WAL signer), and metering/billing — see
[docs/03-engineering/agent-access.md](../../docs/03-engineering/agent-access.md).

**It is privileged but not _trusted_.** Verification never depends on it: a past run still verifies
offline from public Sui with this service stopped. The Enoki private key lives here and only here,
and is never returned to the client.

## Endpoints

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/health` | — | readiness + config echo (never the key) |
| `POST` | `/sponsor` | `{ transactionKindBytes, sender }` | `{ bytes, digest }` |
| `POST` | `/execute` | `{ digest, signature }` | `{ digest }` |

### The sponsored-transaction flow (Sui dual-signer)

1. The Console/agent builds a transaction kind: `tx.build({ client, onlyTransactionKind: true })` →
   base64 `transactionKindBytes`, and knows its own `sender` address.
2. `POST /sponsor` → the paymaster has Enoki sponsor it and returns `{ bytes, digest }`. The paymaster
   always passes its **own** configured Reeg allowlist (`sponsoredTargets`), never a client-supplied
   one, so only Reeg operations can be sponsored.
3. The client signs `bytes` with its own (zkLogin) key → `signature`.
4. `POST /execute` `{ digest, signature }` → Enoki executes and pays the gas; returns `{ digest }`.

## Configuration (env — see `.env.example`)

| Var | Meaning |
|-----|---------|
| `ENOKI_SECRET_KEY` | the Enoki **private** key (`enoki_private_…`). **Server only, never the frontend, never git.** |
| `ENOKI_NETWORK` | `testnet` (default), `mainnet`, `devnet`. Free Enoki plan = testnet only. |
| `REEG_PACKAGE_ID` | the Reeg Move package id; the sponsored allowlist is built from it. |
| `REEG_SPONSORED_TARGETS` | optional override: comma-separated `module::function` suffixes. |
| `REEG_ALLOWED_ORIGINS` | CORS origins allowed to call the paymaster (the Console). |
| `PORT` | listen port (default 8787). |

The server boots without `ENOKI_SECRET_KEY` (so `/health` works during deploy); `/sponsor` and
`/execute` then return `503` until it is set.

## Run

```sh
cp apps/api/.env.example apps/api/.env   # fill in ENOKI_SECRET_KEY + REEG_PACKAGE_ID
pnpm --filter @reeg/api dev              # tsx watch, http://localhost:8787
# or: pnpm --filter @reeg/api build && pnpm --filter @reeg/api start
curl localhost:8787/health
```

Deploy target (Railway / Vercel Functions / any Node host) is not wired yet — it's a plain
`@hono/node-server` app, portable to all three.
