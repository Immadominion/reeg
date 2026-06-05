import { describe, expect, it } from 'vitest';
import {
  buildCreateMachine,
  buildCreateSharedMachine,
  buildFork,
  buildGrant,
  buildRegisterCheckpoint,
  buildRevoke,
  buildSealApproveAllowlist,
  buildSealApproveUntil,
} from './transactions';

// Valid 32-byte ids so the transaction builder's address/object validation is satisfied.
const PACKAGE = `0x${'1'.padStart(64, '0')}`;
const MACHINE = `0x${'2'.padStart(64, '0')}`;
const POLICY = `0x${'3'.padStart(64, '0')}`;
const PARENT = `0x${'4'.padStart(64, '0')}`;
const GRANTEE = `0x${'5'.padStart(64, '0')}`;

// getData() can contain bigint inputs, which JSON.stringify rejects; stringify safely.
function dump(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
}

describe('checkpoint PTB builder', () => {
  it('builds a single register_checkpoint move call', () => {
    const tx = buildRegisterCheckpoint({
      packageId: PACKAGE,
      machineId: MACHINE,
      blobId: 7n,
      manifestHash: Uint8Array.from([9, 9]),
      payloadHash: Uint8Array.from([8]),
    });
    const data = tx.getData() as { commands: unknown[] };
    expect(data.commands).toHaveLength(1);
    const json = dump(data);
    expect(json).toContain('register_checkpoint');
    expect(json).toContain('machine');
  });
});

describe('create and fork PTB builders', () => {
  it('builds create_owned', () => {
    const tx = buildCreateMachine(PACKAGE, POLICY);
    expect(dump(tx.getData())).toContain('create_owned');
  });

  it('builds fork_owned', () => {
    const tx = buildFork(PACKAGE, PARENT, POLICY);
    expect(dump(tx.getData())).toContain('fork_owned');
  });
});

describe('sharing PTB builders', () => {
  it('builds create_shared_machine with no arguments', () => {
    const tx = buildCreateSharedMachine(PACKAGE);
    const data = tx.getData() as { commands: unknown[] };
    expect(data.commands).toHaveLength(1);
    expect(dump(data)).toContain('create_shared_machine');
  });

  it('builds grant with grantee, rights, expiry, and the clock', () => {
    const tx = buildGrant(PACKAGE, MACHINE, POLICY, GRANTEE, 3, 0n);
    const json = dump(tx.getData());
    expect(json).toContain('access');
    expect(json).toContain('grant');
  });

  it('builds revoke', () => {
    const json = dump(buildRevoke(PACKAGE, MACHINE, POLICY, GRANTEE).getData());
    expect(json).toContain('revoke');
  });

  it('builds the allowlist seal_approve against the shared policy', () => {
    const json = dump(buildSealApproveAllowlist(PACKAGE, POLICY, MACHINE).getData());
    expect(json).toContain('seal_approve_allowlist');
  });

  it('builds the time-limited seal_approve_until with the clock', () => {
    const json = dump(buildSealApproveUntil(PACKAGE, POLICY, MACHINE).getData());
    expect(json).toContain('seal_approve_until');
  });
});
