import { describe, expect, it } from 'vitest';
import { buildRegisterAttestedCommand, buildRegisterEnclave } from './attestation';

const PACKAGE = `0x${'1'.padStart(64, '0')}`;
const MACHINE = `0x${'2'.padStart(64, '0')}`;
const CONFIG = `0x${'a'.padStart(64, '0')}`;

function dump(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

describe('attestation PTB builders', () => {
  it('register_enclave loads the Nitro doc then registers it (two calls, chained)', () => {
    const tx = buildRegisterEnclave(PACKAGE, Uint8Array.from([1, 2, 3, 4]));
    const data = tx.getData() as { commands: unknown[] };
    expect(data.commands).toHaveLength(2);
    const json = dump(data);
    expect(json).toContain('load_nitro_attestation');
    expect(json).toContain('register_enclave');
  });

  it('register_attested_command is a single call against the EnclaveConfig', () => {
    const tx = buildRegisterAttestedCommand(
      PACKAGE,
      CONFIG,
      MACHINE,
      7n,
      Uint8Array.from([9, 9]),
      Uint8Array.from([8, 8, 8]),
    );
    const data = tx.getData() as { commands: unknown[] };
    expect(data.commands).toHaveLength(1);
    expect(dump(data)).toContain('register_attested_command');
  });
});
