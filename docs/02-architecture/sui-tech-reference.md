# Sui Tech Reference (verified)

This is the factual backbone for every architecture and feasibility claim in Reeg.
Every statement here traces to a primary source. Other docs cite this file instead
of restating facts. Verified June 2026 against Sui, Walrus, Seal, and Nautilus
official docs and the Mysten Labs Move bootcamp.

If a fact is not in this file, do not assume it. Add it here with a source first.

---

## 0. Platform status snapshot (June 2026)

The whole Sui data stack reached mainnet during 2025-2026. Three facts changed since
the first draft of this suite and are now load-bearing: **Seal committee (t-of-n) mode
is GA**, **Nautilus is live on Sui mainnet**, and **MemWal shipped as a public beta
SDK**. Pin these versions; treat anything newer as an upgrade to evaluate, not a default.

| Component | Package | Version (Jun 2026) | Status | Source |
| --- | --- | --- | --- | --- |
| Sui SDK | `@mysten/sui` | ~2.17.0 | GA | npmjs.com/package/@mysten/sui |
| Move language | - | 2024 edition (enums, macros, method syntax) | GA | blog.sui.io/move-edition-2024-update |
| Walrus SDK | `@mysten/walrus` | ~1.1.7 | mainnet (since Mar 2025) | npmjs.com/package/@mysten/walrus |
| Seal SDK | `@mysten/seal` | ~1.1.3 | mainnet (since Sep 2025), committee mode GA | npmjs.com/package/@mysten/seal |
| Nautilus | (Move + TEE) | custom PCR verification | **live on Sui mainnet (2026)** | docs.sui.io/concepts/cryptography/nautilus |
| MemWal | MemWal SDK | beta (Mar 25 2026) | public beta | docs.memwal.ai, github.com/MystenLabs/MemWal |

MemWal (Walrus Memory) is a shipped public-beta SDK for verifiable, available, portable,
shareable agent memory, with semantic search and Vercel AI SDK integration
(github.com/MystenLabs/MemWal).

Version pins are config, not code (see [engineering-standards.md](../03-engineering/engineering-standards.md)). Re-verify before mainnet cutover.

---

## 1. Sui object model and Move

**Source:** docs.sui.io (Move on Sui, object ownership, PTBs), sui-types `Owner` enum.

- On Sui, **state lives in objects**, not inside the contract. Move objects are
  first-class. This is the opposite of the EVM "data in the contract" model.
- **Four ownership kinds:**
  - `AddressOwner` - owned by an address. Only that address can use it as input.
    Fast path (no consensus ordering). Permissions: read, write, delete, transfer.
  - `ObjectOwner` - owned by another object (a child object), accessed through its
    parent.
  - `Shared` - usable by anyone, requires consensus ordering. Permissions: global
    read, write, delete.
  - `Immutable` - frozen, read-only forever (all published packages are immutable).
- **Access control is capability-based.** Holding a specific owned object is the
  permission. This is the idiomatic Sui pattern and the basis of Reeg's grant/revoke.
- **No inheritance, no polymorphism, no dynamic dispatch.** Move has generics
  (`Type<T>`). Design around composition, not class hierarchies.
- **Package upgrades must be layout-compatible** with the previous version, and you
  must version shared objects deliberately. Plan upgradeability from day one.
- **PTBs (Programmable Transaction Blocks):** one atomic transaction can chain **up
  to 1,024 Move calls**, passing typed results from one command into the next. No
  re-entrancy, no dynamic dispatch. Non-conflicting commands can run in parallel.
  Composition happens at the transaction level, which is cheaper and simpler than
  on-chain orchestration.

**What this means for Reeg:** the `Machine` is a Sui object. Ownership is native, so
"you own your agent's environment" is enforced by the chain, not by our app. Fork,
grant, and revoke are object operations expressible in a single PTB.

---

## 2. Walrus (storage layer = the disk)

**Source:** docs.wal.app (system overview, core concepts, operations, RedStuff),
docs.sui.io Sui Stack Walrus guide.

- Walrus is **decentralized storage for large binary blobs**, using Sui for
  coordination, payment, and governance. Tagline: "a verifiable data platform for
  high-stakes systems that require provable, programmable, always-available data."
- **Status:** live on Sui mainnet since March 2025. SDK `@mysten/walrus` ~1.1.7,
  TypeScript-first. The high-level **WalrusFile API** (read/write files, batch reads)
  and **resumable uploads** (upload state persists so a write can resume after a crash)
  are the current write/read surface; prefer them over raw blob calls.
- **Epochs:** storage is paid in epochs of **two weeks** on mainnet. Storage resources
  carry `start_epoch`/`end_epoch`; lifecycle (extend, let lapse) is an operator concern
  and a real cost lever (NFR-7).
- **Content-addressed.** Data is identified by a `blob_id` derived from the content
  itself. Any change to the data produces a new id. Integrity is tamper-evident and
  independently verifiable. If two users upload identical content, Walrus reuses the
  blob.
- **Blobs are Sui objects.** Each blob has a `Blob` object on Sui, optionally with a
  `Metadata` dynamic field of key-value attributes. Verified struct shapes:

  ```move
  public struct Storage has key, store {
      id: UID,
      start_epoch: u32,
      end_epoch: u32,
      storage_size: u64,
  }
  public struct Blob has key, store {
      id: UID,
      registered_epoch: u32,
      blob_id: u256,
      size: u64,
      encoding_type: u8,
      certified_epoch: option::Option<u32>,
      storage: Storage,
      deletable: bool,
  }
  ```

  `Storage` resources can be split, merged, and transferred.
- **Erasure coding (RedStuff):** redundancy ~4.5x to 5x of original size (far below
  full replication). Reads remain available with up to **2/3 of nodes responsive**;
  writes tolerate up to **1/3 of nodes unavailable**.
- **Availability is provable.** Anyone can prove a blob is stored and remains
  available, via the certified-blob event, the `Blob` object, or a smart contract
  read. The Sui light client returns digitally signed evidence usable offline as a
  proof of availability.
- **All blobs are public.** Walrus does not provide confidentiality. "Do not store
  secrets or private data without additional measures." Encrypt with Seal first.
- **Write path:** app -> Walrus SDK -> (optional) upload relay -> storage nodes; blob
  registered on Sui. **Read path:** aggregator HTTP `GET /v1/{blob_id}` or SDK
  `readBlob()`.
- **When NOT to use Walrus:** not for ultra-low-latency or small ephemeral state. It
  is a durable, verifiable data layer, not a hot scratch disk.

**What this means for Reeg:** the Machine's checkpoint is a Walrus blob; the
`blob_id` is the content hash, so a checkpoint cannot be swapped without changing its
id. Availability proofs and the `Blob` object give us on-chain anchoring for free.
Checkpoint on commit boundaries, keep hot working state local, and snapshot deltas
deliberately because Walrus is not a low-latency disk.

---

## 3. Seal (encryption layer = the lock)

**Source:** docs.sui.io Sui Stack Seal guide, seal-docs.wal.app, Mysten Labs Move
bootcamp K5, Walrus Sites access-control docs.

- Seal is **Decentralized Secrets Management (DSM):** client-side encryption with
  access policies defined and validated on Sui.
- **Status:** live on Sui mainnet since September 2025, with an open operator set
  (Ruby Nodes, NodeInfra, Studio Mirai, Overclock, Triton One, Enoki by Mysten Labs,
  and others). SDK `@mysten/seal` ~1.1.3. **Committee / threshold (t-of-n) mode is now
  GA, not testnet-only** - this is the change to internalize: owner-only, allowlist,
  time-lock, and committee are all production patterns. We still sequence by
  integration risk (owner-only first), not by platform maturity.
- **Three components:**
  1. **On-chain access policies** - Move `seal_approve*` functions you write that
     define who may decrypt. Key servers evaluate them via `dry_run_transaction_block`
     (read-only) on a full node.
  2. **Key servers** - off-chain services holding IBE master secret keys. They return
     a derived key share only if the policy approves. Stateless, horizontally
     scalable. You set a **threshold t-of-n** so decryption needs at least `t` of `n`
     servers to agree.
  3. **Client-side encryption** - encrypt and decrypt locally. Key servers never see
     plaintext.
- **IBE identity model:** the identity is `[packageId] || [id]`. The package at
  `packageId` controls its identity namespace. Seal prepends the package id
  automatically; the `id` you pass at encryption is reused in the `seal_approve` call
  at decryption.
- **`seal_approve` rules:** name must start with `seal_approve`; first parameter is
  `id: vector<u8>`; declared as a non-public `entry` function; must **abort to deny**
  (a clean return means approve); must be side-effect free (it runs in a dry run). A
  package may define several `seal_approve*` variants for different policies.
- **Built-in policy patterns:** private data (single owner), allowlist, subscription
  (time-limited), and more. Ownership transfer of the gating object moves decryption
  rights without exposing data.
- **SDK:** `@mysten/seal`. `SealClient.encrypt` returns the ciphertext plus a backup
  key for disaster recovery (`seal-cli symmetric-decrypt`).
- **Limits to respect:** Seal protects confidentiality at the application layer, not
  at the Walrus storage layer (the `blob_id` itself is not secret). It is **explicitly
  not designed for highly sensitive regulated data such as personal health
  information or government-classified material.**

**What this means for Reeg:** a checkpoint is Seal-encrypted on the user's machine
before it touches Walrus, so the public blob is ciphertext. Access is a Move policy
we write (owner-only by default, allowlist for shared Machines, time-limited for
collaborators), and revoke is enforced by the policy, not by us deleting anything.
For the regulated-data use case, do not promise PHI or classified custody on Seal
alone; name the limit and pair with the appropriate controls.

---

## 4. Nautilus (verifiable compute = optional mainnet tier)

**Source:** docs.sui.io Sui Stack Nautilus (overview, design), blog.sui.io, Mysten
Labs Move bootcamp K4. Status: **live on Sui mainnet** as of 2026; custom PCR
verification is GA, with production integrations (for example Bluefin order matching).
This is a status change from the first draft of this suite, which assumed testnet.

- Nautilus is **verifiable off-chain compute.** Run sensitive or heavy logic in a
  self-managed **TEE** (currently AWS Nitro Enclaves, or Dockerized via the Marlin
  Oyster marketplace), and verify the result on-chain with Move.
- **Two components:** an off-chain server running inside the TEE, and an on-chain
  Move contract that verifies attestations before acting.
- **PCRs (Platform Configuration Registers):** three SHA-384 hashes measuring the
  enclave. PCR0 = OS/boot, PCR1 = application code, PCR2 = runtime config. One byte
  changes, the PCR changes. This is how Sui confirms the enclave runs the expected
  code.
- **Enclave endpoints:** `/health_check`, `/get_attestation` (signed attestation for
  on-chain registration), `/process_data` (your custom logic, signs its response with
  an enclave-held ephemeral key whose private half never leaves the enclave).
- **Trust flow:** register the enclave's PCRs and public key on-chain (stored in an
  `EnclaveConfig` shared object); the enclave signs each result; a Move contract checks
  the signature against the registered key, the PCRs, and a recent timestamp before
  accepting. Attestation is verified on-chain **only at registration** (high gas);
  afterward the enclave key verifies messages cheaply.
- **Reproducible builds** let anyone rebuild the binary and confirm the PCRs match the
  published source, shifting trust from runtime to build time.
- **Listed use case:** "AI agents: securely run AI models for inference or execute
  agentic workflows while providing data and model provenance onchain."

**What this means for Reeg:** Nautilus is the path to proving the *execution* itself,
not just the environment. The core loop proves the environment and the record (Walrus +
Seal + Sui object); Nautilus lets us also attest "this exact code ran on this exact
input and produced this output," closing the loop from verifiable environment to
verifiable execution. Now that it is on mainnet, treat it as a real, optional
verifiable-compute tier we sequence later **by scope, not by platform maturity** - it
deepens the compliance and proof story (a PCR-bound signature on a `Command` event)
but is never a dependency of the own/share/move/prove loop. Do not let it become a
launch blocker, and do not imply the core product needs a TEE.

---

## 5. Source index

- Sui object model / Move / PTBs: <https://docs.sui.io> , <https://www.sui.io/move> ,
  sui-types `Owner` enum (github.com/MystenLabs/sui).
- Walrus: <https://docs.wal.app> , <https://docs.sui.io/sui-stack/walrus> .
- Seal: <https://docs.sui.io/sui-stack/seal> , <https://seal-docs.wal.app> ,
  github.com/MystenLabs/seal , Move bootcamp K5.
- Nautilus: <https://docs.sui.io/concepts/cryptography/nautilus> ,
  <https://blog.sui.io> , github.com/MystenLabs/nautilus , Move bootcamp K4.
- MemWal: <https://docs.memwal.ai> , github.com/MystenLabs/MemWal .
- SDK versions: npmjs.com/package/@mysten/sui , /@mysten/walrus , /@mysten/seal .
</content>
