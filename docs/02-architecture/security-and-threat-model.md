# Security and Threat Model

How Reeg can be attacked and what stops it. Written so a security reviewer can argue with it. Platform facts are in [sui-tech-reference.md](sui-tech-reference.md); the data shapes are in [data-model.md](data-model.md).

## Security goals

- G1 Confidentiality: checkpoint contents are readable only by addresses the owner authorizes.
- G2 Integrity: a stored checkpoint cannot be altered without detection.
- G3 Authenticity of the record: the provenance chain reflects what actually happened and cannot be forged or rewritten after the fact, including by Reeg.
- G4 Availability of evidence: past runs stay verifiable even if Reeg is offline or gone.
- G5 Authorization: only the owner (and grantees) can decrypt or restore a Machine.

## Trust boundaries

- The operator's client: trusted to hold keys and do encryption before data leaves. Plaintext and signing keys live here and nowhere else.
- Sui L1: trusted for ordering and for storing the Machine object and provenance head. Public, tamper-evident.
- Walrus: trusted for durable, content-addressed storage. Public; assumed to return either the exact bytes for a `blob_id` or nothing.
- Seal key servers: semi-trusted, threshold t-of-n, stateless, never see plaintext. They hold IBE master key shares and only release decryption shares when an on-chain `seal_approve` policy passes in dry-run.
- Reeg off-chain infra (indexer, optional upload relay, runtime host): untrusted for verification. Nothing about proving a run may depend on Reeg being honest or online. This is the core stance.

If any verification step requires trusting Reeg's servers, that is a design bug, not a tradeoff.

## Assets

- A1 Checkpoint plaintext (the agent's files and state).
- A2 Encryption keys / owner signing key.
- A3 The Machine object and provenance head on Sui.
- A4 The encrypted blobs on Walrus.
- A5 The access policy (`seal_approve` logic).

## Threats and mitigations (STRIDE-flavored)

### Spoofing

- T-S1 Attacker pretends to be the owner to restore or decrypt. Mitigation: authorization is by Sui address signature evaluated in the `seal_approve` policy; no Reeg-side session to forge. Compromise requires the owner's key (A2).
- T-S2 Fake Console tricks a user. Mitigation: Console is a Walrus Site; verification runs client-side against public Sui + Walrus data, so a cloned UI cannot fake a pass without matching on-chain records.

### Tampering

- T-T1 Alter a stored checkpoint on Walrus. Mitigation (G2): `blob_id` is the content hash; the Machine object pins it. Any byte change yields a different `blob_id` and fails verification ([verification-flow.json](diagrams/verification-flow.json)).
- T-T2 Rewrite history by editing a past provenance entry. Mitigation (G3): provenance is hash-chained; changing an entry breaks the chain to `provenance_head`, which is on Sui and append-only.
- T-T3 Reeg backdates or forges a record. Mitigation: Reeg cannot write the Machine object without the owner's signature, and the chain is verifiable from public data. Reeg has no privileged write.

### Repudiation

- T-R1 Operator denies a run happened, or claims a different result. Mitigation (G3, G4): the anchored, hash-chained record on Sui plus the content-addressed blob is the non-repudiable evidence, checkable by anyone offline-of-Reeg.

### Information disclosure

- T-I1 Walrus blobs are public, so anyone can fetch the ciphertext. Mitigation (G1): all checkpoints are Seal-encrypted client-side before upload. `blob_id` is not secret and is not treated as a secret.
- T-I2 Key server collusion. Mitigation: threshold t-of-n; an attacker needs to compromise t servers. Choose t and the server set accordingly. Key servers are stateless and never see plaintext, limiting blast radius.
- T-I3 Metadata leak (sizes, timing, which Machine checkpointed when) is visible on-chain and on Walrus. Accepted and documented: Reeg protects contents, not the existence of activity. Operators who need to hide activity itself are out of scope.
- T-I4 Plaintext leak on the runtime host while a Machine is live. Mitigation: isolate the runtime; minimize plaintext residency; this is the highest-value target and is treated as such in hardening.

### Denial of service

- T-D1 Reeg infra goes down. Mitigation (G4): does not affect verification or the durability of past runs; Console verify works against Sui + Walrus directly.
- T-D2 Walrus node failures. Mitigation: Walrus durability (reads survive with 2/3 of nodes responsive); Reeg adds no extra single point of failure.
- T-D3 Cost-exhaustion (forcing expensive checkpoints/gas). Mitigation: checkpoint granularity is operator-controlled; the product surfaces cost (NFR-7).

### Elevation of privilege

- T-E1 Grantee keeps access after revoke. Mitigation: policy is evaluated fresh on each `seal_approve`; revoke updates on-chain state so future approvals fail. Note the honest limit below.
- T-E2 Flawed `seal_approve` policy authorizes the wrong party. Mitigation: policies are small, side-effect free, must abort to deny, and are reviewed/tested as security-critical code (see [testing-strategy.md](../03-engineering/testing-strategy.md)).

## Honest limitations

- L1 Revocation is forward-looking. If a grantee already downloaded and decrypted a checkpoint, revoke cannot un-see it. Revoke stops future access, not past copies. We say this plainly.
- L2 `blob_id` confirms which ciphertext exists; it does not hide that a checkpoint exists. Existence and metadata are public (T-I3).
- L3 Security of the live runtime host is conventional sandbox security; the on-chain guarantees protect the record and stored state, not a compromised live host (T-I4).
- L4 Platform dependencies (Sui, Walrus, Seal) carry their own risk; a critical flaw in any of them affects Reeg. Seal committee mode and Nautilus are now mainnet, but we still keep them off the launch critical path by scope, not by maturity, so the core own/share/move/prove loop never blocks on them.
- L5 Reeg is not a regulated-data custody vault; do not store data whose mere existence or metadata exposure is itself a breach.

## seal_approve policy rules we enforce

Every access policy function:

- has a name starting with `seal_approve`,
- takes `id: vector<u8>` as its first parameter,
- is a non-public entry function,
- aborts to deny (no return value means "allow"),
- is side-effect free, because it runs in dry-run on the key servers.

These are not style choices; violating them breaks the security model. See [sui-tech-reference.md](sui-tech-reference.md).

## Review cadence

Threats get re-reviewed at each phase gate in [roadmap.md](../01-product/roadmap.md), and any change to the `seal_approve` policy or the provenance chaining triggers a fresh review before it ships.
</content>
