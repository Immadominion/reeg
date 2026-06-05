# Compliance and evidence (build-roadmap Phase L)

Turning the tamper-evident record Reeg already produces into evidence a regulated buyer can keep
and present, with **no new primitive and no new trusted party**. This records the evidence format,
how an auditor verifies it, the EU AI Act Article 12 mapping, retention, and the honest limits. The
architecture rationale is [system-architecture.md](../02-architecture/system-architecture.md)
section 6.

## The evidence file

`reeg evidence <machineId> --out evidence.json` exports a portable JSON record an auditor keeps. It
is a read and a serialization over the same provenance and content-addressed checkpoints everything
else uses ([@reeg/verify](../../packages/verify/src/evidence.ts)). It contains:

- the Machine's on-chain facts: id, owner, `current_blob_id`, `manifest_hash`, `provenance_head`,
  `checkpoint_count`, parent, `policy_id`, created-at epoch;
- the full ordered provenance chain, each entry with its `seq`, event type, `blob_id`,
  `manifest_hash`, **command-log digest** (the checkpoint `payload_hash`), timestamp, and resulting
  `entry_hash`;
- any fork lineage (the parent head, child head, and the parent's chain of heads); and
- the network and package id, so anyone can independently re-anchor against the public chain.

It contains no plaintext and no key material: checkpoints are encrypted on Walrus, and the evidence
records only hashes and public chain facts.

## How an auditor verifies it

Two layers, both available with no Reeg service and no Console:

- **Offline (`reeg audit evidence.json`)** replays the provenance chain in the file and confirms it
  reaches the recorded head, that the checkpoint count and `0..n-1` sequence hold, and that the
  latest checkpoint's blob and manifest match. This proves the file is **internally consistent and
  untampered**: altering any entry, or the head, makes the replay fail. It needs nothing but the
  file and the verifier (the same `verifyMachine` the Console's Verify button uses).
- **Anchored (`reeg audit evidence.json --anchor`)** additionally reads the live Machine from Sui
  and confirms the recorded head, checkpoint count, blob id, and manifest still match the chain.
  This proves the file is **authentic** (the real on-chain state), not a self-consistent forgery.

Offline verification establishes integrity; anchoring establishes authenticity. Together they are
the full tamper-evidence story, and the chain remains the authority either way.

## EU AI Act Article 12 mapping

Article 12 (logging duties for high-risk AI, applying 2 August 2026) requires automatically
generated, tamper-evident records that someone other than the operator can examine, retained for a
minimum period (at least six months for the high-risk classes).

- **Automatically generated:** every checkpoint, grant, and revoke appends a hash-chained
  provenance entry on chain; the record is a by-product of running, not a separate logging step.
- **Tamper-evident:** the chain is anchored to `provenance_head` on Sui and the checkpoints are
  content-addressed on Walrus; any change breaks the hash chain. Offline `reeg audit` detects file
  tampering; `--anchor` detects divergence from the chain.
- **Examinable by a third party:** the evidence file plus the public chain need no Reeg service and
  no Console (NFR-1). The auditor re-verifies independently.
- **Retention:** the on-chain provenance head is permanent; the checkpoint *blobs* are retained for
  the Walrus storage epochs paid at checkpoint time (`reeg checkpoint --epochs N`). On testnet an
  epoch is roughly two weeks, so the six-month minimum is about 13 epochs (`--epochs 13`). The
  checkpoint command surfaces the window and the cost (WAL plus SUI gas) plainly.
- **Retirement (end of life):** `reeg retire <machineId>` appends a permanent, verifiable RETIRE
  entry to the provenance chain (a `MachineRetired` event, included in evidence and offline audit),
  marking when a run was formally concluded. It anchors the start of the post-run retention clock,
  after which the operator may let the Walrus storage window lapse while the on-chain head stays
  permanent. The Reeg client declines further checkpoints on a retired Machine.

## Honest limits

- **Records, not a data-custody vault.** The compliance value is auditable, tamper-evident records
  of agent work. Reeg is not a regulated PHI or classified-data custody vault; Seal is not designed
  for data whose mere existence is a breach. Say that plainly to compliance buyers.
- **Offline audit proves consistency, not authenticity on its own.** A self-consistent evidence file
  can be fabricated offline; that is why authenticity comes from anchoring to the public chain
  (`--anchor`), which anyone can do with the machine id in the file. The chain, not the file, is the
  authority.
- **Retention is a paid window.** If the Walrus epochs lapse, the ciphertext blob can be garbage
  collected even though the on-chain provenance head persists; the operator must keep blobs paid
  through the required window. `reeg retire` (FR-6) records the verifiable end of life that anchors
  this window; hard on-chain blocking of post-retirement checkpoints would need a Machine schema
  change and is deferred (the client enforces it today).
- **Attested execution is optional and deeper.** Proving *what code ran* (not just that the
  environment and history are authentic) attaches a Nautilus PCR-bound signature to a `Command`
  event; that is roadmap phase N, for the subset of high-risk runs that need it.
