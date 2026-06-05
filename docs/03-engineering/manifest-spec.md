# Manifest and Artifact-Boundary Spec

This is the frozen contract between the Rust snapshot engine (`engine/`) and the
TypeScript client (`packages/`). The engine produces these artifacts; the client
encrypts, stores, and anchors them. Neither side may read the other's internals, so this
document is the only thing they share. Field shapes align with
[data-model.md](../02-architecture/data-model.md); this spec pins the byte-level encoding
that makes a checkpoint reproducible and a `manifest_hash` stable.

Why a frozen spec: verification compares recomputed hashes against on-chain anchors. If
either side encodes the manifest differently, the hashes diverge and verification fails
for an honest run. So encoding is part of the security model, not a detail.

## 1. Content-addressed store (CAS)

A checkpoint's bytes live in a content-addressed store. Every object is identified by the
hex-encoded BLAKE3-256 hash of its exact bytes.

- Hash: BLAKE3, 256-bit (32 bytes), lowercase hex (64 chars). Written `ContentHash`.
- `put(bytes) -> ContentHash`, `get(ContentHash) -> bytes`, `has(ContentHash) -> bool`.
- Identical bytes produce one object (dedup is automatic and is the point).
- The store never mutates an existing object; an object's name is a hash of its content.

Two object kinds live in the CAS:

- **File object**: the raw, unmodified bytes of a regular file. Its hash is the file's
  content hash.
- **Directory node**: the canonical JSON encoding (section 3) of a directory's entries.
  Its hash commits to all descendants, so the root directory node's hash is the
  `workdir_root_hash`. This makes the tree a Merkle DAG: any change to any file or name
  changes the root hash.

Symlinks are not separate objects; they are recorded inline in their parent directory
node.

## 2. Filesystem capture (the Merkle DAG)

Capture walks the working directory bottom-up and records, for each entry, only what is
needed to rebuild it byte-identically, and nothing that varies between hosts or runs.

Recorded per entry: the entry name, its kind (`file` | `dir` | `symlink`), the Unix
permission bits (`mode & 0o777`), and either a content hash (file), a child node hash
(dir), or a link target (symlink).

Deliberately excluded, because they break reproducibility without being needed to restore
content: modification and access times, uid and gid, inode and device numbers, and any
ordering that depends on directory iteration order.

Unsupported entry kinds (sockets, FIFOs, block and character devices) are an error, not a
silent skip. Phase B narrows the runtime surface to clean file-based state rather than
weakening the reproducibility guarantee (see
[technical-feasibility-study.md](../04-feasibility/technical-feasibility-study.md)).

## 3. Canonical encoding

Both directory nodes and the manifest are hashed over a canonical JSON encoding so the
same logical input always produces the same bytes:

- Compact JSON: no insignificant whitespace.
- Object keys sorted ascending by Unicode code point (the engine builds them from sorted
  maps; the client must match).
- Struct fields serialized in the fixed order this spec lists, never reordered.
- Integers only for sizes and counts; no floating-point numbers anywhere.
- Byte strings (hashes, link targets) encoded as lowercase hex or UTF-8 strings, never as
  platform-native blobs.

A directory node is the canonical JSON of its entry map: entry name to
`{ kind, mode, hash | target }`.

## 4. The manifest

The manifest is the small, signed-over summary of a checkpoint. Field order is fixed:

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | integer | Starts at 1. Bumped only for incompatible changes. |
| `packages` | array of `{ name, version }` | Sorted by name then version. |
| `env` | object (string to string) | Sorted keys. Secret values redacted (section 5). |
| `tools` | array of string | Sorted ascending. |
| `memory_pointer` | string or null | BLAKE3 content hash of the captured agent memory directory when a run has memory (phase K), null otherwise. Being in the manifest, it is part of `manifest_hash`, so memory is verified with the environment. See [agent-memory.md](agent-memory.md). |
| `workdir_root_hash` | `ContentHash` (hex) | Root directory node hash from section 2. |

`manifest_hash = BLAKE3(canonical_json(manifest))`, lowercase hex. This is the value the
Move `Machine` object pins on chain (phase D) and the verifier recomputes (phase F).

## 5. Secret redaction

Environment values are redacted before they enter the manifest, so a checkpoint never
inlines a secret. An env var is redacted when its key matches a case-insensitive secret
pattern (for example contains `SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `CREDENTIAL`). A
redacted value is replaced with the fixed marker `"<redacted>"`. The key is kept so the
environment's shape is still verifiable; the value is not. Non-secret values pass through
unchanged.

## 6. Versioning

`schema_version` governs compatibility. Additive, backward-compatible changes keep the
version and append fields at the end of the fixed order. Any change that would alter the
bytes of an existing input (reordering, renaming, re-encoding) is incompatible and bumps
the version. The engine and the client must agree on the version they read and write.
