import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Machine } from '@reeg/chain';
import { genesisHead, type ProvenanceEntry, replayChain, toEvidence } from '@reeg/verify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The headline acceptance demo (build-roadmap phase J) lives in test/live/acceptance.ts and runs
// on testnet (pnpm --filter @reeg/test run live:acceptance): run -> checkpoint -> kill host ->
// restore on a fresh host -> verify with the Reeg backend offline -> grant -> revoke. It cannot
// run in CI without funds, so this offline test guards the CLI surface that demo drives: every
// operator command stays registered. It runs only when the CLI is built (the gate builds first).
const CLI = fileURLToPath(new URL('../../packages/cli/dist/index.js', import.meta.url));
const built = existsSync(CLI);

describe('reeg CLI surface', () => {
  it.runIf(built)('registers every operator command the acceptance demo uses', () => {
    const help = execFileSync('node', [CLI, '--help'], { encoding: 'utf8' });
    for (const command of [
      'create',
      'run',
      'checkpoint',
      'restore',
      'fork',
      'retire',
      'grant',
      'revoke',
      'verify',
      'evidence',
      'audit',
    ]) {
      expect(help).toContain(command);
    }
  });

  it.skipIf(built)(
    'skipped: build the CLI (pnpm --filter @reeg/cli build) to run the surface check',
    () => {},
  );
});

// The compliance done-bar (phase L): an auditor verifies a run from an exported evidence file
// alone, with no Reeg and no Console. This builds a real evidence file and runs `reeg audit`
// fully offline (no network), proving a good file passes and a tampered one fails.
describe('reeg audit (offline evidence verification)', () => {
  const ID = `0x${'cd'.repeat(32)}`;
  let dir: string;

  function evidenceJson(tamper?: (head: string) => string): string {
    const idBytes = Uint8Array.from(
      ID.slice(2)
        .match(/../g)
        ?.map((h) => parseInt(h, 16)) ?? [],
    );
    const entries: ProvenanceEntry[] = [
      {
        seq: 0n,
        eventType: 0,
        blobId: 42n,
        manifestHash: Uint8Array.of(1, 2, 3),
        payloadHash: Uint8Array.of(9),
        timestampMs: 1000n,
      },
    ];
    const genesis = genesisHead(idBytes);
    const machine: Machine = {
      id: ID,
      owner: '0xowner',
      currentBlobId: 42n,
      manifestHash: Uint8Array.of(1, 2, 3),
      provenanceHead: replayChain(genesis, entries),
      checkpointCount: 1n,
      parent: null,
      policyId: '0xpolicy',
      createdAtEpoch: 1,
    };
    const evidence = toEvidence(
      { machine, machineIdBytes: idBytes, entries },
      { network: 'testnet', packageId: `0x${'9'.repeat(64)}`, exportedAtMs: 1_700_000_000_000 },
    );
    if (tamper) {
      evidence.machine.provenanceHead = tamper(evidence.machine.provenanceHead);
    }
    return JSON.stringify(evidence, null, 2);
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'reeg-audit-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.runIf(built)('passes a good evidence file offline as internally consistent (exit 0)', () => {
    const file = join(dir, 'good.json');
    writeFileSync(file, evidenceJson());
    const out = execFileSync('node', [CLI, 'audit', file], { encoding: 'utf8' });
    // Offline audit asserts internal consistency, not authenticity (that needs --anchor).
    expect(out).toContain(`Internally consistent (NOT anchored to chain): ${ID}`);
  });

  it.runIf(built)('fails a tampered evidence file offline (non-zero exit)', () => {
    const file = join(dir, 'tampered.json');
    writeFileSync(
      file,
      evidenceJson(() => '00'.repeat(32)),
    );
    expect(() =>
      execFileSync('node', [CLI, 'audit', file], { encoding: 'utf8', stdio: 'pipe' }),
    ).toThrow();
  });
});
