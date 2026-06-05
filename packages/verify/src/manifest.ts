import { blake3Hash, compareUtf8, toHex, utf8 } from './hash';

/** The manifest schema version, matching the Rust engine's SCHEMA_VERSION. */
export const SCHEMA_VERSION = 1;

export interface ManifestPackage {
  name: string;
  version: string;
}

/**
 * The manifest, mirroring the Rust engine's struct (engine/crates/snapshot/src/manifest.rs)
 * and the contract in docs/03-engineering/manifest-spec.md. `workdirRootHashHex` is the hex
 * the engine's ContentHash serializes to.
 */
export interface Manifest {
  schemaVersion: number;
  packages: ManifestPackage[];
  env: Record<string, string>;
  tools: string[];
  memoryPointer: string | null;
  workdirRootHashHex: string;
}

/**
 * Produce the exact canonical JSON bytes the Rust engine hashes: serde_json compact output,
 * fixed field order, map keys sorted, arrays sorted, no insignificant whitespace, no floats.
 * This MUST byte-match the engine; the conformance fixture test (manifest.conformance.test.ts)
 * fails if the two encoders ever diverge. Inputs are normalized here so a non-normalized
 * manifest still produces the canonical form (sorting and dedup are idempotent on the
 * engine's already-normalized output).
 */
export function canonicalManifestBytes(manifest: Manifest): Uint8Array {
  const packages = [...manifest.packages]
    .sort((a, b) => compareUtf8(a.name, b.name) || compareUtf8(a.version, b.version))
    .map((p) => ({ name: p.name, version: p.version }));

  const tools = dedupeSorted([...manifest.tools].sort(compareUtf8));

  const env: Record<string, string> = {};
  for (const key of Object.keys(manifest.env).sort(compareUtf8)) {
    env[key] = manifest.env[key] as string;
  }

  // Field order is the canonical order and must not be reordered. JSON.stringify preserves
  // insertion order for non-integer string keys, which all of these are.
  const ordered = {
    schema_version: manifest.schemaVersion,
    packages,
    env,
    tools,
    memory_pointer: manifest.memoryPointer,
    workdir_root_hash: manifest.workdirRootHashHex,
  };
  return utf8(JSON.stringify(ordered));
}

/** `BLAKE3(canonical_bytes)` as lowercase hex, the value the Machine object pins. */
export function manifestHashHex(manifest: Manifest): string {
  return toHex(blake3Hash(canonicalManifestBytes(manifest)));
}

/**
 * Verify a manifest's stored canonical bytes against the on-chain manifest hash, without
 * re-encoding. This is the robust integrity check for when the decrypted checkpoint bundle is
 * available: hash the exact stored bytes and compare. Re-encoding is only needed when
 * constructing a manifest from parts.
 */
export function manifestBytesMatch(manifestBytes: Uint8Array, expectedHashHex: string): boolean {
  return toHex(blake3Hash(manifestBytes)) === expectedHashHex.toLowerCase();
}

function dedupeSorted(sorted: string[]): string[] {
  const out: string[] = [];
  for (const item of sorted) {
    if (out.length === 0 || out[out.length - 1] !== item) {
      out.push(item);
    }
  }
  return out;
}
