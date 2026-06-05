import type { Machine } from '@reeg/chain';
import { bytesEqual, toHex } from './hash';
import {
  computeForkChildHead,
  EVENT_CHECKPOINT,
  genesisHead,
  type ProvenanceEntry,
  replayChain,
} from './provenance';

/** A single verification check and whether it held. */
export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

/** The outcome of verifying a Machine. `ok` is true only if every check passed. */
export interface VerificationReport {
  ok: boolean;
  checks: Check[];
}

/**
 * Everything needed to verify (not merely trust) a forked Machine's lineage. `childHead` is
 * the genesis emitted in the child's MachineForked event; `parentHead` is the parent's head
 * at fork time; `parentHeads` is every head the parent's chain passes through, so the
 * recorded parent head can be confirmed to be a genuine head rather than an invented value.
 */
export interface ForkProof {
  childHead: Uint8Array;
  parentHead: Uint8Array;
  parentHeads: Uint8Array[];
}

export interface VerifyInput {
  /** The Machine object read from Sui (public data). */
  machine: Machine;
  /** The raw object-id bytes, used to recompute the genesis head and the fork binding. */
  machineIdBytes: Uint8Array;
  /** Provenance entries reconstructed from chain events, in ascending seq order. */
  entries: ProvenanceEntry[];
  /** Present for a forked Machine; absent for one created fresh. */
  fork?: ForkProof;
}

/**
 * Verify a Machine's integrity from public data alone: recompute its genesis (and, for a
 * fork, that the genesis is cryptographically bound to a real head of the named parent),
 * replay the provenance chain to the on-chain head, and confirm the latest checkpoint's
 * anchors match the Machine object. This needs no decryption and no Reeg service. Tampering
 * with any entry, reordering or duplicating them, swapping the head, or forging a fork makes
 * at least one check fail.
 */
export function verifyMachine(input: VerifyInput): VerificationReport {
  const checks: Check[] = [];
  const genesis = resolveGenesis(input, checks);

  const replayed = replayChain(genesis, input.entries);
  checks.push(
    check(
      'provenance-head',
      bytesEqual(replayed, input.machine.provenanceHead),
      `replayed ${toHex(replayed)} vs on-chain ${toHex(input.machine.provenanceHead)}`,
    ),
  );

  const checkpoints = input.entries.filter((e) => e.eventType === EVENT_CHECKPOINT);

  checks.push(
    check(
      'checkpoint-count',
      BigInt(checkpoints.length) === input.machine.checkpointCount,
      `${checkpoints.length} checkpoint entries vs on-chain count ${input.machine.checkpointCount}`,
    ),
  );

  checks.push(
    check(
      'sequence-contiguous',
      checkpoints.every((e, i) => e.seq === BigInt(i)),
      `checkpoint seqs must be 0..n-1 with no gaps, duplicates, or reordering; got [${checkpoints.map((e) => e.seq).join(', ')}]`,
    ),
  );

  const last = checkpoints.at(-1);
  if (last) {
    checks.push(
      check(
        'current-blob-id',
        last.blobId === input.machine.currentBlobId,
        `latest entry blob ${last.blobId} vs on-chain ${input.machine.currentBlobId}`,
      ),
    );
    checks.push(
      check(
        'manifest-hash',
        bytesEqual(last.manifestHash, input.machine.manifestHash),
        `latest entry manifest hash ${toHex(last.manifestHash)} vs on-chain ${toHex(input.machine.manifestHash)}`,
      ),
    );
  }

  return { ok: checks.every((c) => c.passed), checks };
}

// Recompute the chain's genesis and, for a fork, verify the lineage binding. Appends the
// fork checks to `checks` and returns the genesis the chain must replay from.
function resolveGenesis(input: VerifyInput, checks: Check[]): Uint8Array {
  if (!input.fork) {
    return genesisHead(input.machineIdBytes);
  }
  const { childHead, parentHead, parentHeads } = input.fork;

  const expectedChildHead = computeForkChildHead(parentHead, input.machineIdBytes);
  checks.push(
    check(
      'fork-binding',
      bytesEqual(childHead, expectedChildHead),
      `child genesis ${toHex(childHead)} must equal blake2b256(parent_head ++ [FORK] ++ id) ${toHex(expectedChildHead)}`,
    ),
  );

  checks.push(
    check(
      'fork-parent-head',
      parentHeads.some((h) => bytesEqual(h, parentHead)),
      `recorded parent head ${toHex(parentHead)} must be a real head of the parent chain`,
    ),
  );

  // Replay from the child head regardless; if the binding failed, fork-binding already
  // records it, and replaying from the emitted head still lets the other checks run.
  return childHead;
}

function check(name: string, passed: boolean, detail: string): Check {
  return { name, passed, detail };
}
