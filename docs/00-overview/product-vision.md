# Product Vision

## The one line

**Reeg is Dropbox for AI agent environments. Reeg is infrastructure for portable computing environments: AI-agent runs first.**

Reeg is infrastructure for portable computing environments. We started with AI agents
because they're the fastest-growing source of ephemeral work, but the underlying system
can preserve and move any environment. You run the work (your agent, your container,
your microVM, someone else's cloud) and at every commit Reeg snapshots the whole
working state, proves exactly what happened, and lets you own, share, fork, and restore
it anywhere. Reeg is not a sandbox, a server, or an OS; it is the layer over them, and
you run the work. The history is tamper-proof and the environment is yours, on no one's
server. This is no longer a plan: Reeg is **live on Sui mainnet** today,
where create, encrypted checkpoint, anchoring, and offline verify all work. The full
encrypted checkpoint → restore → verify loop is **proven on testnet**; on mainnet,
encrypted restore (decrypt) waits on a working mainnet Seal key server.

## The problem, in plain language

A computing environment does real work, then disappears. The clearest case today is an
AI agent: it writes code, moves money, files tickets, changes records, and acts on
behalf of people and companies. But the same loss shows up for a CI job, an eval
harness, or a person at a keyboard. The environment where all that happens is rented
from a vendor and gone the moment the session ends. You cannot hand it to a teammate
as-is, you cannot fork a good run to try two directions, you cannot move it off that
vendor, and you cannot let an outside party confirm what really happened. The work got
done, but the workspace it happened in was never yours to keep, share, or stand behind.

That is fine when an agent summarizes an email. It starts to hurt the moment the
work is worth keeping: a long coding run you want to continue tomorrow, an
environment a colleague needs to pick up, a result a client wants to check, a setup
you want to reuse a hundred times.

## What Reeg does

Your agent runs in a sandbox (the local engine, an OCI container, a Firecracker
microVM, or a third party like Daytona or E2B). Reeg sits on top: it snapshots that
environment, anchors a tamper-proof record of what happened on Sui, and stores the
encrypted bytes on Walrus, so you can prove, share, fork, and restore the exact
environment later.

What makes that different from saving a folder is what the snapshot *is*. It is not a
row in a vendor's database, it is a **Machine** object you own on Sui, backed by your
own content-addressed data on Walrus, encrypted client-side with Seal, with a
hash-chained provenance log anchored on Sui that anyone can verify offline. That one
change gives you four things a folder, a Docker image, or a vendor's history cannot.

## The four pillars

Everything Reeg does falls out of a single design choice: the environment is an
object you hold on Sui plus your own data on Walrus. Four capabilities follow.

1. **Own it.** A Machine is an *owned* Sui object on the fast path. You `create` it,
   you `retire` it, and the owner alone can mutate it. It is your repo, with no vendor
   in the middle: no one can silently change it, lock you out, or delete it.

2. **Share it.** Every checkpoint is **Seal-encrypted client-side before it ever
   touches Walrus**. A shared `AccessPolicy` object holds the grants. You `grant` and
   `revoke` access with an allowlist and time-limited expiry, and each change appends
   a `GRANT` or `REVOKE` entry to the provenance chain. The committee t-of-n Seal
   threshold is fixed at encryption time (`reeg checkpoint --threshold t`). Revocation
   is forward-looking by design: it cannot un-see data someone already decrypted.

3. **Move it.** `fork` a Machine from any checkpoint with provable on-chain lineage
   back to its parent, or `restore` a checkpoint on *any* host, byte-for-byte
   identical. Because snapshots are content-addressed and deterministic, portability
   across hosts is not best-effort, it is guaranteed by construction.

4. **Prove it.** Each Machine object carries a hash-chained, append-only,
   tamper-evident provenance head. Anyone can verify it **offline** from public Sui
   and Walrus data alone, with no Reeg backend in the loop. This is the part GitHub
   cannot give you: its history can be force-pushed and rewritten, and you trust GitHub
   it was not. For runs where you also need to prove *which code* produced a checkpoint,
   there is an optional **Nautilus TEE attestation** tier (below).

The short version: own it, share it, move it, prove it. Version control for the whole
environment, not just the code, with a history no one can rewrite. GitHub history can
be rewritten; this cannot.

## The snapshot engine

Underneath the pillars is a Rust engine (the `snapshot`, `runtime`, and `cli`
crates). It uses a content-addressed store keyed by BLAKE3, so identical content is
stored once and a restore is byte-identical across hosts *and* across runtime tiers.
A canonical umask is pinned so captured file modes never leak the ambient login
umask, which is what makes cross-tier determinism hold. The engine captures the
working directory plus an optional agent memory directory (the `memory_pointer`
round-trips cleanly). The Rust engine and the TypeScript client meet at exactly one
artifact boundary, a manifest plus content-addressed files; the engine never imports
a chain or storage client, which keeps the determinism honest.

## Runtime tiers

The same capture-and-verify path runs across every tier behind a single `Runtime`
trait:

- **Local**: for development, no isolation.
- **OCI container**: `runc`, read-only rootfs, a per-session tmpfs `/work`, and
  network isolation proven by an unreachable metadata service.
- **Firecracker microVM**: KVM kernel-boundary isolation, per-session tmpfs,
  read-only rootfs, and an in-guest agent that speaks a length-prefixed framed
  protocol over vsock. Phase M hardening is **19/19 complete**, verified on a real
  AWS KVM host, including running the Firecracker VMM under the **jailer** (chroot,
  privileges dropped to an unprivileged uid/gid, cgroup v2).

## The Nautilus attestation tier

The provenance chain proves *that* a checkpoint happened and *what* its contents
were. The optional Nautilus tier proves *which code* produced it, and it is **live on
both testnet and mainnet today**.

A tiny, *reproducible* AWS Nitro enclave (musl-static, about a 6.5MB `.eif`; two
cache-cleared rebuilds produce identical PCRs) derives an ed25519 key from NSM
entropy, obtains a Nitro attestation document embedding that key, and signs a
checkpoint's manifest hash over a frozen preimage. On chain, `register_enclave`
verifies the Nitro document via `0x2::nitro_attestation` and pins the PCRs and the
ed25519 key into a shared `EnclaveConfig` (once per build); `register_attested_command`
then cheaply ed25519-verifies each per-checkpoint signature and emits
`CommandAttested`. An offline verifier (`@reeg/verify`) confirms the signature and
that the PCRs match the trusted reproducible build, and it flags all-zero debug-mode
PCRs.

The tier is **strictly additive**: it makes zero changes to `machine.move`'s layout
or provenance head, so a non-attested run is byte-identical to before. Critically,
the enclave *attests* results; it does not *run* the agent. The agent stays in the
Firecracker VM, which preserves both portability and offline verification.

## Who it is for

Agents are the lead use case, not the only one. The same layer fits anyone whose work
happens in an environment worth keeping, sharing, or standing behind.

- **Teams running agents that touch money, code, or customers.** They need to prove
  what an agent did when something goes wrong or is disputed.
- **Companies under audit or regulation.** They need an independent, durable record
  of automated decisions, not a vendor's internal log.
- **Builders of agent platforms.** They want a standard, ownable format for agent
  environments and run history that they do not have to invent themselves.
- **Anyone with an environment worth preserving.** A long CI job, an eval harness, or a
  research setup a person built by hand, kept, moved between hosts, and proven later.

## The honest tradeoff

We are not trying to be the sandbox. Use whatever runner you like for the agent; Reeg
is the layer on top. The snapshot-and-prove step adds work a throwaway scratch
environment does not need, and coordinating across Sui and Walrus is slower than a
single datacenter. We took that trade on purpose. If you want a scratch environment for
thirty seconds of work, you do not need Reeg. If the run is worth owning, sharing,
reusing, or standing behind, that is exactly what Reeg adds, and nothing else gives you
a tamper-proof, ownable record of it.

The cost of that ownership is small and measured: on mainnet, a create plus an
encrypted checkpoint (one epoch, including the Walrus upload-relay tip) runs about
**0.0099 SUI + 0.0119 WAL**.

## Honest constraints

We keep the shortcomings in plain sight:

- **Mainnet decryption waits on a Seal key server.** A Seal-encrypted checkpoint on
  mainnet needs a mainnet Seal key server to decrypt. Mainnet currently has no free
  public Open-mode key server (the decentralized committee server is "available
  soon"; independent providers run Permissioned mode that requires signup, and the
  free-tier provider key we tried returns a provider-side 403). So on mainnet today:
  encryption, storage, anchoring, and offline verify **all work**; only decrypt (the
  `restore` of an encrypted checkpoint) waits on a working provider key server. The
  full encrypted checkpoint → restore → verify loop is **proven on testnet**.
- **Attestation runs on the Nitro host.** `reeg checkpoint --attest` runs on the AWS
  Nitro host, where the engine reaches the local enclave over vsock with the
  operator's key on that host.
- **The hardware tiers need an AWS box.** Firecracker, OCI, the jailer, and Nautilus
  require a Linux KVM and Nitro host. The local tier and the full own / share / move
  / prove chain run anywhere.

## What Reeg is not

- Not a memory API. Memory is one part of the environment, not the product.
- Not the sandbox or compute. You run the agent; Reeg versions and proves what it did.
- Not "decentralized because crypto." Nobody should switch for decentralization. They
  switch because they can finally own, share, move, and prove an agent's environment,
  which a folder, a Docker registry, or a vendor's history cannot give them.

## Why now

Two forces. AI agents are being handed real authority faster every month, and the work
they do is starting to be worth keeping and sharing rather than throwing away. They are
the wedge: the fastest-growing source of ephemeral work, felt as a loss the day a good
run vanishes. At the same time, accountability rules for automated systems are arriving.
We frame Reeg against the EU AI Act's record-keeping and logging expectations
(Article 12), in force **2 August 2026**: tamper-evident provenance with configurable
Walrus retention (`--epochs`; roughly six months is about 13 testnet epochs), plus
`reeg evidence` and `reeg audit`, which export a portable evidence file an auditor can
keep. That is positioning, not legal advice, and we keep the claims honest. The
ownership and sharing win earns the adoption; the proof makes it defensible, and the
same layer extends to any environment worth proving, not agents alone.

## How we win

A sandbox vendor can copy any feature we ship except two: a history no one can rewrite,
and an environment you actually own. Those make sharing, portability, and independent
proof possible, and all four pillars fall out of one design choice (the environment is
an object you hold on Sui plus your data on Walrus) that a vendor's own database cannot
match. We are the layer over any sandbox, adding the parts none of them can, and it is
shipped: Reeg is live on Sui mainnet, attestation included. Because that layer never
cared what produced the environment, agents are the entry point and the same own /
share / move / prove holds for any computing environment, so the category grows under
us rather than capping us.

## The built-on-Sui story (one paragraph)

Reeg is built on the Sui stack because the pieces line up exactly with what the
product needs. Walrus stores the environment as content-addressed data you own. A
Sui object acts as the kernel: it holds ownership, permissions, and the verification
anchor, and it is programmable, so forking, granting, and revoking access are
on-chain operations. Seal encrypts the environment on your machine before it leaves,
with access controlled by `seal_approve` policies you write. Nautilus is the live
attestation tier that proves the execution itself, not just the environment. The
whole stack is on Move 2024 with `@mysten/sui`, `@mysten/walrus`, and `@mysten/seal`
at npm latest. See
[../02-architecture/sui-tech-reference.md](../02-architecture/sui-tech-reference.md)
for the verified details, including the live mainnet and testnet package IDs.
