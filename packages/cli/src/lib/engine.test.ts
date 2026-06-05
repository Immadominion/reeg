import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineCheckpoint, engineRestore, engineRun } from './engine';

// A stand-in for the Rust binary: it ignores its inputs and prints the JSON shape each
// subcommand is contracted to emit, so the invocation and parse path are tested without cargo.
function stubEngine(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reeg-engine-'));
  const bin = join(dir, 'stub.sh');
  writeFileSync(
    bin,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  run) echo \'{"exitCode":0,"seq":3}\' ;;',
      '  checkpoint) echo \'{"manifestHashHex":"aa","workdirRootHashHex":"bb","memoryPointer":"dd","payloadHashHex":"cc","bundleBytes":42}\' ;;',
      '  restore) echo \'{"manifestHashHex":"aa","workdirRootHashHex":"bb","memoryPointer":null}\' ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe('engine invocation', () => {
  it('parses run output', async () => {
    const result = await engineRun(stubEngine(), '/tmp/wd', '/tmp/log.json', ['echo', 'hi']);
    expect(result).toEqual({ exitCode: 0, seq: 3 });
  });

  it('parses checkpoint output', async () => {
    const info = await engineCheckpoint(
      stubEngine(),
      '/tmp/wd',
      '/tmp/out.bundle',
      '/tmp/log.json',
    );
    expect(info.manifestHashHex).toBe('aa');
    expect(info.payloadHashHex).toBe('cc');
    expect(info.bundleBytes).toBe(42);
    expect(info.memoryPointer).toBe('dd');
  });

  it('parses restore output', async () => {
    const info = await engineRestore(stubEngine(), '/tmp/in.bundle', '/tmp/dest');
    expect(info).toEqual({ manifestHashHex: 'aa', workdirRootHashHex: 'bb', memoryPointer: null });
  });

  it('gives a helpful error when the binary is missing', async () => {
    await expect(
      engineRun('/nonexistent/reeg-engine-xyz', '/tmp/wd', '/tmp/log.json', ['x']),
    ).rejects.toThrow(/reeg-engine not found/);
  });
});
