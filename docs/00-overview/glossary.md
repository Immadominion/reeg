# Glossary

Defined once, used everywhere. If a term is used in any Reeg doc, it lives here.

## Product terms

- **Reeg** - the product. GitHub for AI agents: the version-control and proof layer
  that snapshots an agent's environment into a record you own, share, fork, move
  across hosts, and verify. Not the sandbox; the layer over it.
- **Machine** - one agent's computing environment in Reeg: its filesystem, package
  manifest, environment variables, memory pointer, and identity. Represented on-chain
  as a Sui object (the `Machine` object).
- **Checkpoint** - a saved state of a Machine at a point in time. Stored as an
  encrypted blob on Walrus and registered against the Machine object.
- **Snapshot** - the act of producing a checkpoint (verb), or the blob it produces.
- **Restore** - pulling a checkpoint from Walrus onto any host, decrypting it, and
  resuming the Machine exactly as it was.
- **Provenance log** - the tamper-evident, hash-chained record of what happened to a
  Machine (checkpoints created, commands run, access granted or revoked). Its head
  is anchored on the Machine object on Sui.
- **Fork** - cloning a Machine into a new Machine object that records its parent
  on-chain, so lineage and attribution are provable.
- **Manifest** - the canonical description of a Machine's environment (packages, env
  vars, tool list, memory pointer, working-directory root hash). Hashed to bind it.
- **Verify** - the act of independently checking that a checkpoint and its history
  are exactly what was claimed, using only public data and with no Reeg server in
  the loop.
- **Console** - Reeg's web interface, deployed as a Walrus Site. Shows Machines,
  their provenance, and the verify and restore actions.

## Sui stack terms (see sui-tech-reference.md for verified detail)

- **Sui** - the layer-1 blockchain Reeg is built on. Object-centric, Move-based.
- **Move** - the smart-contract language on Sui. Data lives in objects, not in the
  contract. No inheritance, no dynamic dispatch.
- **Object** - the first-class unit of state on Sui. Can be owned by an address,
  owned by another object, shared, or immutable.
- **Owned object** - an object owned by a single address; only the owner can use it
  as a transaction input. Fast path, no consensus ordering required.
- **Shared object** - an object anyone can reference; requires consensus ordering.
- **Capability** - the Sui-idiomatic access-control pattern: holding a specific
  owned object grants a permission.
- **PTB (Programmable Transaction Block)** - a single atomic transaction that can
  chain up to 1,024 Move calls, passing the result of one into the next.
- **Walrus** - decentralized storage for large binary blobs, coordinated by Sui.
  Content-addressed and tamper-evident.
- **Blob** - an immutable byte array stored on Walrus, identified by a content-derived
  `blob_id`. Also exists as a `Blob` object on Sui.
- **blob_id** - the content-derived identifier of a Walrus blob. Changing the content
  changes the id.
- **Walrus Site** - a static website served directly from Walrus, used for the Reeg
  Console.
- **Seal** - decentralized secrets management. Client-side encryption with access
  policies written in Move and enforced by threshold key servers.
- **seal_approve** - the Move function an app writes to define who may decrypt. Key
  servers evaluate it via a read-only dry run.
- **IBE (Identity-Based Encryption)** - the scheme Seal uses; any string can be a
  public key, so you encrypt to a policy-defined identity with no key exchange.
- **Threshold (t-of-n)** - Seal's trust model: decryption needs at least `t` of `n`
  independent key servers to agree.
- **Nautilus** - verifiable off-chain compute on Sui. Runs code in a Trusted
  Execution Environment and lets Sui verify the result.
- **TEE (Trusted Execution Environment)** - isolated hardware-protected compute (Reeg's
  path uses AWS Nitro Enclaves via Nautilus) the host itself cannot read.
- **PCR (Platform Configuration Register)** - SHA-384 measurements of the exact code
  and config running inside a TEE; how Sui confirms an enclave runs what it claims.
- **Attestation** - the signed document a TEE produces proving its integrity, verified
  on-chain during enclave registration.

## Market and compliance terms

- **The switching test** - our bar for whether a feature makes someone leave their
  current tool. Ownership and verifiability pass it; decentralization does not.
- **Neutral recorder** - the positioning: Reeg records agent work in a form the
  recording vendor does not control, so it can be used as evidence against any party.
- **EU AI Act Article 12 / 19** - record-keeping and automatic-logging obligations
  for high-risk AI systems, in force 2 August 2026. The concrete regulatory driver
  for the compliance use case.
</content>
