// Offline verification of the optional Nautilus attestation tier. A verifier confirms, from Sui
// alone, that a checkpoint was endorsed by a measured enclave: the on-chain CommandAttested event
// only exists because register_attested_command ed25519-verified the enclave's signature over the
// frozen preimage, and the EnclaveConfig's PCRs are the measurements the (reproducible) enclave
// build is known to produce. This is additive: a Machine with no attestations verifies unchanged.

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { fetchCheckpointLinks } from './readers';

/** A registered enclave identity, read from its on-chain EnclaveConfig. */
export interface EnclaveIdentity {
  configId: string;
  /** ed25519 public key (32 bytes). */
  pubkey: Uint8Array;
  /** PCR index -> measurement bytes. All-zero PCRs indicate a debug-mode enclave (not trusted). */
  pcrs: Map<number, Uint8Array>;
}

/** One on-chain attestation of a checkpoint (a CommandAttested event). */
export interface AttestationRecord {
  configId: string;
  seq: bigint;
  manifestHash: Uint8Array;
  enclavePubkey: Uint8Array;
}

export interface AttestationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface AttestationReport {
  ok: boolean;
  attested: boolean;
  records: AttestationRecord[];
  checks: AttestationCheck[];
}

/** Sui serializes a Move `vector<u8>` in events/objects as a JSON number array (or a hex string in
 *  some shapes); accept both so this is robust across RPC encodings. */
function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (typeof value === 'string') {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    return Uint8Array.from((hex.match(/../g) ?? []).map((h) => Number.parseInt(h, 16)));
  }
  return new Uint8Array();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toHexLower(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isAllZero(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes.every((b) => b === 0);
}

/** Read and parse an EnclaveConfig shared object. */
export async function readEnclaveConfig(
  client: SuiJsonRpcClient,
  configId: string,
): Promise<EnclaveIdentity> {
  const obj = await client.getObject({ id: configId, options: { showContent: true } });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  if (!fields) throw new Error(`EnclaveConfig ${configId} not found or has no content`);
  const pubkey = toBytes(fields.enclave_pubkey);
  const pcrs = new Map<number, Uint8Array>();
  const contents = (fields.pcrs as { fields?: { contents?: unknown[] } } | undefined)?.fields
    ?.contents;
  for (const entry of contents ?? []) {
    const ef = (entry as { fields?: { key?: unknown; value?: unknown } }).fields;
    if (ef && typeof ef.key === 'number') pcrs.set(ef.key, toBytes(ef.value));
  }
  return { configId, pubkey, pcrs };
}

/** All on-chain attestations for a Machine (CommandAttested events filtered by machine id). */
export async function fetchAttestations(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<AttestationRecord[]> {
  const out: AttestationRecord[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined;
  do {
    const page = await client.queryEvents({
      query: { MoveEventType: `${packageId}::attestation::CommandAttested` },
      cursor,
      order: 'ascending',
    });
    for (const event of page.data) {
      const json = event.parsedJson as {
        machine_id?: string;
        config_id?: string;
        seq?: string;
        manifest_hash?: unknown;
        enclave_pubkey?: unknown;
      };
      if (json.machine_id === machineId && json.config_id) {
        out.push({
          configId: json.config_id,
          seq: BigInt(json.seq ?? '0'),
          manifestHash: toBytes(json.manifest_hash),
          enclavePubkey: toBytes(json.enclave_pubkey),
        });
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return out;
}

/**
 * Verify a Machine's attestations offline. For each CommandAttested record: confirm the event's
 * enclave key matches the registered EnclaveConfig, that the manifest hash ties to the Machine's
 * checkpoint at that sequence, and — when `expectedPcrs` is supplied — that the enclave's PCRs match
 * the trusted (reproducible) build and are not the all-zero PCRs of a debug enclave.
 *
 * Additive: a Machine with no attestations returns `{ ok: true, attested: false }` unchanged.
 *
 * `expectedPcrs` maps a PCR index (0/1/2) to its lowercase hex measurement (from the build's
 * pcrs.json). Omit it to verify only the on-chain consistency (key + checkpoint binding).
 */
export async function verifyAttestation(
  client: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
  options: { expectedPcrs?: Record<number, string> } = {},
): Promise<AttestationReport> {
  const records = await fetchAttestations(client, packageId, machineId);
  const checks: AttestationCheck[] = [];

  if (records.length === 0) {
    return {
      ok: true,
      attested: false,
      records,
      checks: [{ name: 'attestation-optional', passed: true, detail: 'no attestations on chain' }],
    };
  }

  const checkpoints = await fetchCheckpointLinks(client, packageId, machineId);
  const manifestBySeq = new Map<bigint, Uint8Array>();
  for (const link of checkpoints) manifestBySeq.set(link.entry.seq, link.entry.manifestHash);

  const configCache = new Map<string, EnclaveIdentity>();
  for (const record of records) {
    let config = configCache.get(record.configId);
    if (!config) {
      config = await readEnclaveConfig(client, record.configId);
      configCache.set(record.configId, config);
    }
    const tag = `seq ${record.seq}`;

    checks.push({
      name: `attestation-key-matches-config (${tag})`,
      passed: bytesEqual(record.enclavePubkey, config.pubkey),
      detail: `enclave key ${toHexLower(config.pubkey).slice(0, 16)}…`,
    });

    const checkpointManifest = manifestBySeq.get(record.seq);
    if (checkpointManifest) {
      checks.push({
        name: `attestation-binds-checkpoint (${tag})`,
        passed: bytesEqual(record.manifestHash, checkpointManifest),
        detail: 'manifest hash matches the checkpoint at this sequence',
      });
    }

    const debug = [...config.pcrs.values()].some(isAllZero);
    if (options.expectedPcrs) {
      for (const [index, expected] of Object.entries(options.expectedPcrs)) {
        const actual = config.pcrs.get(Number(index));
        checks.push({
          name: `pcr${index}-matches-trusted-build (${tag})`,
          passed: actual !== undefined && toHexLower(actual) === expected.toLowerCase(),
          detail: debug
            ? 'enclave PCRs are all zero (debug mode — not a trusted build)'
            : undefined,
        });
      }
    } else if (debug) {
      checks.push({
        name: `enclave-not-debug (${tag})`,
        passed: false,
        detail:
          'enclave PCRs are all zero (debug mode); supply expectedPcrs to require a trusted build',
      });
    }
  }

  return { ok: checks.every((c) => c.passed), attested: true, records, checks };
}
