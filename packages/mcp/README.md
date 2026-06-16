# @reeg/mcp

The Reeg [Model Context Protocol](https://modelcontextprotocol.io) server. It exposes every Reeg
verb as a tool, so any agent, Claude Code, Cursor, a custom agent, an IDE, can create, snapshot,
restore, share, fork, retire, and **verify** agent environments, and everything it does is reeged
(owned by you on Sui, data on Walrus, independently verifiable). This is the agent-facing surface of
the architecture in [docs/03-engineering/agent-access.md](../../docs/03-engineering/agent-access.md).

## Tools

**Read / verify: need no signer, read only public Sui + Walrus (work today, no infrastructure):**

| Tool | Does |
|------|------|
| `reeg_verify` | Verify a Machine's provenance from public Sui data, with the Reeg backend offline. |
| `reeg_get` | Read a Machine object (owner, checkpoint count, provenance head, lineage, policy). |
| `reeg_evidence` | Export a portable evidence file an auditor can verify offline. |
| `reeg_audit` | Verify an evidence file; `anchor=true` also confirms it against live Sui. |
| `reeg_list` | List the environments created/restored locally (the chain is authoritative). |

**Write: sign with the operator's local-keystore key today** (the sponsored/delegated signer of
agent-access.md slots in behind the same surface later):

| Tool | Does |
|------|------|
| `reeg_create` | Create a new shareable environment you own. |
| `reeg_fork` | Fork an environment into a child with provable lineage. |
| `reeg_retire` | Append a permanent, verifiable end-of-life marker. |
| `reeg_share` / `reeg_revoke` | Grant / revoke another address's access (owner only). |
| `reeg_run` | Run a command in an environment's working directory (local; no signer). |
| `reeg_checkpoint` | Pack → encrypt → store on Walrus → anchor on Sui. Needs the engine + signer. |
| `reeg_restore` | Read → decrypt → unpack the latest checkpoint. Needs the engine + signer. |

## Configuration (by environment)

Set these in your MCP client's server definition. Read/verify tools need only `REEG_NETWORK` +
`REEG_PACKAGE_ID`; write tools also need `REEG_OPERATOR` (and its key in the sui keystore);
`reeg_checkpoint`/`reeg_restore` also need `REEG_ENGINE`.

| Var | Meaning |
|-----|---------|
| `REEG_NETWORK` | `testnet` (default), `mainnet`, `devnet`, `localnet`. |
| `REEG_PACKAGE_ID` | the Reeg Move package id. |
| `REEG_OPERATOR` | the address that signs write transactions. |
| `REEG_ENGINE` | path to the `reeg-engine` binary (for checkpoint/restore). |
| `REEG_RPC_URL` | override the Sui RPC URL. |
| `REEG_SEAL_KEY_SERVERS` | comma-separated Seal key-server object ids (testnet has a default). |
| `REEG_SEAL_THRESHOLD` | Seal t-of-n threshold (default 1). |
| `REEG_WALRUS_UPLOAD_RELAY` | Walrus upload-relay host (testnet has a default). |
| `SUI_KEYSTORE` | path to the sui keystore (default `~/.sui/sui_config/sui.keystore`). |
| `REEG_HOME` | local state + workdir root (default `~/.reeg`). |

Every per-call argument (`network`, `rpc`, `package`, `operator`) can also be passed on the tool call
itself, layered over the env config.

## Wiring it up

Build first: `pnpm --filter @reeg/mcp build` (produces `dist/index.js`, an executable `reeg-mcp` bin).

**Claude Code** (the package isn't published yet, so point at the built file):

```sh
claude mcp add reeg \
  --env REEG_NETWORK=testnet \
  --env REEG_PACKAGE_ID=0x... \
  --env REEG_OPERATOR=0x... \
  --env REEG_ENGINE=/abs/path/to/reeg-engine \
  -- node /abs/path/to/overflow26/packages/mcp/dist/index.js
```

**Any MCP client** (Cursor, Claude Desktop, `.mcp.json`):

```json
{
  "mcpServers": {
    "reeg": {
      "command": "node",
      "args": ["/abs/path/to/overflow26/packages/mcp/dist/index.js"],
      "env": {
        "REEG_NETWORK": "testnet",
        "REEG_PACKAGE_ID": "0x...",
        "REEG_OPERATOR": "0x...",
        "REEG_ENGINE": "/abs/path/to/reeg-engine"
      }
    }
  }
}
```

## Security

- **The private key is never returned.** Write tools sign in memory from the local keystore; tool
  results carry only object ids, digests, and hashes, never key material. The `reeg_checkpoint`
  disaster-recovery backup key is deliberately not surfaced over MCP.
- **Verification stays backend-free.** `reeg_verify` / `reeg_audit` read only public Sui (+ optional
  Walrus), so an agent, or an auditor, proves a past run with every Reeg service stopped.
- **stdio is the protocol channel.** All logging goes to stderr; a stray stdout write would corrupt
  the JSON-RPC stream.

## Status

`reeg_verify`, `reeg_get`, and `reeg_list` are proven end to end against **live mainnet**. Write tools
sign with the local keystore today; "Sign in with Reeg", sponsored gas, and sponsored storage are the
next bricks. See [docs/03-engineering/agent-access.md](../../docs/03-engineering/agent-access.md).
