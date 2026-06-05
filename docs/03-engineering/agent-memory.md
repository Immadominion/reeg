# Agent memory (build-roadmap Phase K)

Memory that is owned, checkpointed, and verified with the rest of the environment. The design adds
no new primitive and no new trusted party: agent memory is captured the same content-addressed way
the working directory is, so it travels inside the checkpoint bundle and its content hash becomes
part of `manifest_hash`. This records the model, the integration seam, and the honest limits.

## The model: memory is a captured directory

A Machine has a **memory directory** alongside its working directory (`<machine>/memory`, a sibling
of `<machine>/work`). On checkpoint the engine captures it into the same content-addressed store as
the workdir (a BLAKE3 Merkle tree), so its objects ride inside the bundle, and records its root as
the manifest's `memory_pointer`. On restore the engine rebuilds it from the bundle. Because
`memory_pointer` is a field of the manifest, it is part of `manifest_hash`, which is anchored on
chain and recomputed by the verifier, so **memory is verified with the environment** by construction
(`packages/verify` needs no change; it already hashes the whole manifest).

This means memory survives a checkpoint and restore **on any host with no memory service running**:
the bytes are in the content-addressed bundle, re-verified against their hashes on unpack, exactly
like the filesystem. Restoring on a fresh host that never saw the original rebuilds the memory
directory byte for byte.

The `memory_pointer` is `Option<String>`: when no memory is present it stays `null` and the
filesystem-and-environment story stands on its own, so a memory-less run is unaffected and keeps the
same manifest shape (the done-bar's "if MemWal is unavailable, the rest still stands").

## The integration seam: REEG_MEMORY_DIR

The runtime exposes the memory directory to every command it runs as the environment variable
`REEG_MEMORY_DIR`. Any memory backend writes its state there, and the next `reeg checkpoint`
captures it:

```sh
reeg run <machineId> -- my-agent          # the agent persists memory under $REEG_MEMORY_DIR
reeg checkpoint <machineId>               # captures the memory dir; prints its content hash
reeg restore  <machineId> --dest <dir>    # rebuilds the workdir and, beside it, the memory dir
```

This is the "MemWal as one runtime call behind the runtime adapter" integration, made backend
agnostic: **MemWal (Walrus Memory) is adopted by pointing its persistence at `REEG_MEMORY_DIR`** (or
by a thin sync of its store to that directory before checkpoint and from it after restore). The same
seam works for a plain file-based memory or a vector index. Nothing in the capture, restore, or
verification path depends on which backend wrote the bytes.

## Honest limits

- **Memory is captured at the commit boundary, not live-mirrored.** Like the filesystem, what is
  checkpointed is the memory directory's state at checkpoint time, not an always-on mirror. Memory a
  backend holds only in its own process and never flushes to `REEG_MEMORY_DIR` is not captured.
- **Restore reproduces the bytes, not a running memory service.** The engine rebuilds the memory
  directory; bringing a memory backend back up over it (re-opening a vector index, for example) is
  the backend's job, the same way re-running commands is the agent's job (see
  [cross-host-portability.md](cross-host-portability.md)).
- **Encrypted and access-controlled like everything else.** The memory bytes are inside the
  checkpoint bundle, which is Seal-encrypted before it touches Walrus, so memory inherits the same
  ownership and sharing (a grantee who can restore the environment can read its memory). Treat
  memory contents with the same sensitivity as the workdir; this is records of agent work, not a
  custody vault for the most sensitive data classes (see
  [compliance-evidence.md](compliance-evidence.md)).
- **Size and cost.** Memory adds to the bundle, so it adds to the WAL storage cost and the bytes
  surfaced at checkpoint. Large vector stores are real cost; surface it honestly (the checkpoint
  output already reports bundle size and the retention window).
