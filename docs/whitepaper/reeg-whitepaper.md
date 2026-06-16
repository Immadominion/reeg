# Reeg Whitepaper

Version: Sui Overflow 2026. This document stands on its own; you can share it with someone who has read nothing else. For the verified platform details behind every technical claim, see [sui-tech-reference.md](../02-architecture/sui-tech-reference.md).

Tagline: **Reeg is Dropbox for AI agent environments.** Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment.

Contact: <hello@reeg.xyz>. Security disclosures: <security@reeg.xyz>.

## Abstract

Reeg is infrastructure for portable computing environments. We started with AI agents
because they're the fastest-growing source of ephemeral work, but the underlying system
can preserve and move any environment. You run the
work (your agent, your container, your microVM, someone else's cloud) and that
environment is rented from a vendor and gone when the session ends. You cannot share a
running environment with a teammate, fork a good run, move it off the vendor, or let an
outsider confirm what happened. Reeg sits over the sandbox you already use: the work runs
in whatever sandbox you like, and at every commit Reeg snapshots that environment into a
**Machine** object you own on Sui, its filesystem and agent memory stored as
content-addressed blobs on Walrus, encrypted client-side with Seal, with a hash-chained
provenance log anchored on Sui. It does not run your workload or hold your compute. That
single change lets you **own, share, move, and prove** the whole environment. Version
control for the whole environment, not just the code, with two things GitHub cannot
give you: a history no one can rewrite, and an environment that is yours. Anyone you
choose can verify what happened **offline**, from public Sui and Walrus data alone, with
no Reeg backend in the loop. We started with AI agents because they're the
fastest-growing source of work worth keeping, sharing, and standing behind, but the same
layer can preserve, move, and prove any environment you run. Reeg is **live on Sui
mainnet**.

## 1. The problem

An agent does real work inside an environment, and that environment is a dead end.

- You cannot keep it. It belongs to the vendor and disappears when the session ends.
- You cannot share or fork it. The best you can pass to a teammate or client is a
  transcript, not the actual workspace the agent worked in.
- You cannot move it. The run is tied to one host and one vendor.
- You cannot prove it. The only record of what happened is the vendor's, held by the
  same party whose work is in question.

These are not edge cases. They are the default condition of every agent sandbox in
use right now. The agent's work is real, but the place it happened was never yours.

## 2. Why it matters now

Two forces make this urgent. First, AI agents are moving from demos to production, where
the work is worth keeping, sharing, and reusing rather than throwing away, and where
a lost or unportable run costs real money. Agents are the wedge, the fastest-growing
source of work worth keeping, but the same loss is felt by any environment nobody owns.
Second, the EU AI Act's record-keeping duties for high-risk AI systems point toward
automatically generated, tamper-evident records of system operation. The first force
earns adoption (own and share the work you run); the second makes it defensible (the
proof you already get for free starts to look like a requirement). (Positioning, not
legal advice.)

## 3. What Reeg is

Reeg is the layer over the sandbox you already run, not a sandbox, server, or OS, but
the version-control and proof layer over them. You run the work in whatever sandbox you
like; Reeg waits at the commit boundary and gives you the loop a centralized box never
could: snapshot the whole working state, restore it, fork it, resume where you left off,
on an environment that is yours, not the vendor's. The difference is what the environment
is, and what that lets you do with it. Those four verbs are Reeg's four pillars:

- **Own it.** The environment is a Machine, an owned object you hold on Sui, backed by
  your own content-addressed data on Walrus. Not a row in a vendor's database. The
  owner alone mutates it.
- **Share it.** Every checkpoint is Seal-encrypted on your machine before it ever
  touches storage. A shared access policy holds time-limited, allowlist grants you can
  add or revoke; each grant and revoke is written into the provenance chain.
- **Move it.** Fork a Machine from any checkpoint with provable on-chain lineage to its
  parent, and restore any checkpoint on any host, byte-for-byte identically.
- **Prove it.** A hash-chained, append-only, tamper-evident provenance head lives on the
  Machine object and is verified offline from public Sui and Walrus alone. Optionally,
  a TEE attestation tier (Nautilus) proves *which code* produced a checkpoint.

The first three are why people adopt. The fourth comes for free because the first
three are built on Sui.

## 4. How it works

Reeg composes Sui-ecosystem primitives, each used for what it is genuinely good at,
and pairs them with a deterministic snapshot engine and a hardened runtime.

### 4.1 The Machine (Sui)

Each environment is a Machine, an owned object on Sui (the fast path: no consensus
ordering, only the owner can use it as input). State on Sui lives in objects with
capability-based access control, so ownership is a fact enforced by the chain, not a
promise in a contract. The Machine object carries the current provenance head and
references to the latest checkpoint. Programmable Transaction Blocks let Reeg register
a checkpoint and append a provenance entry in a single atomic transaction. The owner
`create`s a Machine and `retire`s it when done.

### 4.2 The checkpoint (Walrus)

When the agent reaches a commit boundary, Reeg captures the environment state into a
snapshot, encrypts it on the client, and stores it on Walrus. Walrus is
content-addressed: the blob's identifier is the hash of its contents. That gives
integrity for free, because any change to a stored checkpoint changes its identifier,
and the Machine object pins the expected one. Retention is configurable per checkpoint
(`reeg checkpoint --epochs`; roughly six months is about 13 testnet epochs).

### 4.3 The lock (Seal)

Walrus blobs are public, so confidentiality cannot depend on storage. Reeg encrypts
every checkpoint client-side with Seal before it leaves the operator's machine. Who can
decrypt is decided by an on-chain `seal_approve` policy: owner-only by default, with
optional grants to specific addresses. The Seal committee threshold (t-of-n) is fixed
at encryption time (`reeg checkpoint --threshold t`). Reeg never holds the keys and
never sees plaintext.

### 4.4 The provenance chain

Each checkpoint appends an entry to an append-only, hash-chained record whose head
lives on the Machine object. Grant and revoke operations append `GRANT`/`REVOKE`
entries to the same chain. To rewrite history you would have to break the chain to a
head that is anchored on Sui and append-only. You cannot, and neither can Reeg.

### 4.5 The snapshot engine (Rust)

Underneath the chain primitives sits a deterministic snapshot engine in Rust (the
`snapshot`, `runtime`, and `cli` crates). It is a content-addressed store keyed by
BLAKE3: identical content yields identical addresses, so restore is byte-identical
across different hosts and across different runtime tiers. A canonical umask is pinned
so captured file modes never leak the host's ambient login umask, which keeps captures
deterministic across tiers. The engine captures the working directory plus an optional
agent-memory directory (the memory pointer round-trips intact). The Rust engine and the
TypeScript client meet at exactly one artifact boundary, a manifest plus
content-addressed files; the engine never imports a chain or storage client, and the
client never reaches inside the engine.

### 4.6 Runtime tiers

The same capture-and-verify path runs across every isolation tier behind one Rust
`Runtime` trait, so portability is real and not tier-specific:

- **Local** (development): no isolation; runs anywhere, fastest iteration.
- **OCI container** (runc): read-only rootfs, a per-session tmpfs `/work`, and network
  isolation proven by an unreachable metadata service.
- **Firecracker microVM**: KVM kernel-boundary isolation, per-session tmpfs, read-only
  rootfs, and an in-guest agent reached over vsock with a length-prefixed framed
  protocol. The Firecracker VMM runs under the **jailer** (chroot, privileges dropped to
  an unprivileged uid/gid, cgroup v2). The microVM hardening pass is complete and
  verified on a real AWS KVM host.

The local tier and the full own/share/move/prove chain run anywhere; the OCI,
Firecracker, and jailer tiers require a Linux KVM host (an AWS box).

## 5. Proof, for free

Because every environment is an object on Sui backed by content-addressed storage on
Walrus, a property falls out that no database-backed sandbox can match: anyone can
verify what an agent did without trusting the vendor. Given only a Machine
identifier, an auditor can:

1. read the Machine object and walk the provenance chain from its head,
2. confirm each entry hashes to its parent,
3. fetch the checkpoint blob from Walrus and confirm its identifier equals the hash of its contents,
4. confirm the recorded state hashes match the Machine object.

Every input to this is public, on Sui or on Walrus. None of it requires Reeg to be
online or honest. If Reeg disappeared tomorrow, every past run stays verifiable. We did
not bolt on an audit log; this is just what owning the environment on Sui gives you. It
is the moat precisely because we did not have to build it as a feature.

### 5.1 Attestation: proving *which code* produced a checkpoint (Nautilus)

The base proof shows *what* a run produced and that nobody tampered with the record.
An optional attestation tier, built on Nautilus and **live on Sui testnet and
mainnet**, adds the next question an auditor asks: *which code produced this?*

A tiny, reproducible AWS Nitro enclave (musl-static, about a 6.5 MB `.eif`; two
cache-cleared rebuilds produce identical PCRs) derives an ed25519 key from NSM entropy,
obtains a Nitro attestation document that embeds that key, and signs a checkpoint's
manifest hash over a frozen preimage. On chain, `register_enclave` verifies the Nitro
document via `0x2::nitro_attestation` and pins the PCRs and the ed25519 key into a
shared `EnclaveConfig` (once per build); `register_attested_command` then cheaply
ed25519-verifies each per-checkpoint signature and emits a `CommandAttested` event. An
offline verifier (`@reeg/verify`) confirms the signature and that the PCRs match the
trusted reproducible build, flagging all-zero debug-mode PCRs.

The design is strictly additive: it makes zero changes to the Machine object's layout
or provenance head, so a non-attested run is byte-identical to one without attestation.
Crucially, the enclave **attests results; it does not run the agent**. The agent stays
in the Firecracker VM, which preserves portability and offline verification. Live
`EnclaveConfig`s have been verified offline on both networks. Attested checkpoints are
produced on the AWS Nitro host (the engine reaches the local enclave over vsock with the
operator's key on that host).

## 6. Live status and cost

Reeg is **live on Sui mainnet**.

- **Mainnet package:** `0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e`
  (upgraded from the original
  `0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3` via a Sui package
  upgrade to add the attestation module).
- **Testnet package:** `0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2`.
- **Measured mainnet cost:** about 0.0099 SUI + 0.0119 WAL per create-plus-encrypted-checkpoint
  (one epoch, including the Walrus upload-relay tip). Package publish is about 0.047 SUI;
  the upgrade was about 0.05 SUI.

The CLI (`reeg`) exposes the whole lifecycle: `create`, `run`, `checkpoint`
(`--epochs`, `--threshold`, `--attest --enclave-config`), `restore`, `fork`, `grant`,
`revoke`, `retire`, `verify`, `evidence`, `audit`, and `enclave register`. The
TypeScript CLI shells to a Rust engine binary (`reeg-engine`) for snapshot and restore
and, on the Nitro host, for the enclave vsock client.

## 7. What Reeg is not

- Not the fastest sandbox. A centralized box in one datacenter has lower latency. We
  took that trade for ownership; for throwaway scratch work, a centralized box is the
  right tool. We do everything it does and add what it cannot.
- Not a regulated-data vault. Reeg protects and records the application layer; it is not positioned as a custody vault for regulated or classified data.
- Not an agent framework. Reeg is the environment, not the agent's logic. Even the
  attestation enclave attests results rather than running the agent.

## 8. Honest limits

We keep these plain rather than hide them.

- **Revocation is forward-looking.** Revoking a grant stops future access; it cannot
  un-read a checkpoint a grantee already decrypted.
- **Existence is public.** Encryption hides contents, not the fact that a checkpoint
  exists, nor its metadata.
- **Mainnet decrypt waits on a key server.** A Seal-encrypted checkpoint on mainnet
  needs a mainnet Seal key server. Today mainnet has no free public Open-mode Seal key
  server (the decentralized committee server is "available soon"; independent providers
  run Permissioned mode requiring signup, and one free-tier provider key currently
  returns 403 from its gateway, a provider-side activation matter, not Reeg's code). So
  on mainnet, encryption, storage, anchoring, and offline verification all work today;
  only decrypt (restore of an encrypted checkpoint) waits on a working provider key
  server. The full encrypted checkpoint to restore to verify loop is proven end-to-end
  on testnet.
- **The hardened tiers need the right host.** The Firecracker, OCI, jailer, and
  Nautilus tiers require a Linux KVM (and, for attestation, Nitro) host, an AWS box. The
  local tier and the full own/share/move/prove chain run anywhere.

## 9. The market

The buyer is a team running agents whose work is worth keeping: developers who want
to snapshot, share, and fork agent environments instead of losing them; teams that
need to move runs across hosts without lock-in; and, increasingly, organizations that
must produce a tamper-evident record of what their agents did to meet the EU AI Act
logging duties. Reeg is framed against EU AI Act Article 12 (record-keeping): a
tamper-evident provenance chain with configurable Walrus retention, plus `reeg
evidence` and `reeg audit`, which export a portable evidence file an auditor keeps.
(This is positioning, not legal advice; we keep the claim honest.) The wedge is
concrete and immediate: own and share the environment your agent ran in instead of
renting it and losing it. Agents are the first use case, not the ceiling: the same
own / share / move / prove holds for any computing environment you run. The competitive
line is simple: a centralized sandbox can match any feature except letting you own the
environment, and ownership is what makes sharing, portability, and independent proof
possible at all.

## 10. Conclusion

Agents do real work in environments nobody owns, that nobody can share, move, or
prove. Reeg keeps the snapshot-and-restore experience teams already expect and makes
the environment a Machine you own on Sui, backed by your own content-addressed data on
Walrus, encrypted with Seal, anchored by a hash-chained provenance log, and optionally
attested by a reproducible TEE. Owning it is what lets you share it, fork it, move it,
and let anyone verify it offline. We do what the fast boxes do, on top of the one thing
they cannot: real ownership of the place your agents work. It is live on Sui mainnet
today.

Reeg is Dropbox for AI agent environments. Own it, share it, move it, prove it.

Learn more: reeg.xyz. Contact: <hello@reeg.xyz>.
</content>
</invoke>
