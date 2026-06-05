# Config

Per-network configuration. The code is identical across networks; only these files and the
values in `.env` differ (see [.env.example](../.env.example)). Nothing here is hardcoded in
code, so testnet and mainnet are a config switch, not a code change (build-roadmap phase A).

- `network` - which network this file describes.
- `sui.rpcUrl` - Sui full node RPC endpoint.
- `walrus.aggregatorUrl` / `walrus.publisherUrl` - Walrus read and write endpoints.
- `seal.keyServerObjectIds` - the threshold (t-of-n) Seal key server object ids to use.
  Fill from the current operator set before relying on Seal.
- `reeg.packageId` - the published Move package id (set by `scripts/publish-package`).
- `reeg.machinePolicyId` - the deployed Seal policy object id.

Endpoints are sensible defaults and must be re-verified against the current Walrus and Seal
operator docs before mainnet. Confirm status in
[docs/02-architecture/sui-tech-reference.md](../docs/02-architecture/sui-tech-reference.md).
Key server ids and package ids are intentionally `0x0` / empty until deployment.
