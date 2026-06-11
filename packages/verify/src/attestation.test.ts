import { describe, expect, it } from 'vitest';
import { verifyAttestation } from './attestation';

// Minimal SuiJsonRpcClient stub returning the exact shapes the testnet run produced: a
// CommandAttested event (vector<u8> as number arrays) + an EnclaveConfig with a VecMap of PCRs.
const PKG = '0xpkg';
const MACHINE = '0xmachine';
const CONFIG = '0xconfig';
const PUBKEY = Array.from({ length: 32 }, (_, i) => i + 1);
const MANIFEST = Array.from({ length: 32 }, (_, i) => 100 + i);

function client(opts: { pcrZero: boolean; attested: boolean }) {
  return {
    async queryEvents({ query }: { query: { MoveEventType: string } }) {
      if (!opts.attested || !query.MoveEventType.endsWith('::attestation::CommandAttested')) {
        return { data: [], hasNextPage: false, nextCursor: null };
      }
      return {
        data: [
          {
            parsedJson: {
              config_id: CONFIG,
              machine_id: MACHINE,
              seq: '0',
              manifest_hash: MANIFEST,
              enclave_pubkey: PUBKEY,
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      };
    },
    async getObject() {
      const pcr = opts.pcrZero ? new Array(48).fill(0) : new Array(48).fill(7);
      return {
        data: {
          content: {
            fields: {
              enclave_pubkey: PUBKEY,
              pcrs: {
                fields: {
                  contents: [{ fields: { key: 0, value: pcr } }],
                },
              },
            },
          },
        },
      };
    },
    // No checkpoints, so the checkpoint-binding check is skipped (the readers query returns []).
  } as unknown as Parameters<typeof verifyAttestation>[0];
}

describe('verifyAttestation', () => {
  it('passes a Machine with no attestations (the tier is additive)', async () => {
    const r = await verifyAttestation(client({ pcrZero: false, attested: false }), PKG, MACHINE);
    expect(r.attested).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('flags a debug-mode enclave (all-zero PCRs)', async () => {
    const r = await verifyAttestation(client({ pcrZero: true, attested: true }), PKG, MACHINE);
    expect(r.attested).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name.startsWith('enclave-not-debug') && !c.passed)).toBe(true);
    // The enclave key still matches its config.
    expect(
      r.checks.some((c) => c.name.startsWith('attestation-key-matches-config') && c.passed),
    ).toBe(true);
  });

  it('passes when PCRs match the trusted build', async () => {
    const expectedPcrs = { 0: '07'.repeat(48) };
    const r = await verifyAttestation(client({ pcrZero: false, attested: true }), PKG, MACHINE, {
      expectedPcrs,
    });
    expect(r.ok).toBe(true);
    expect(r.checks.some((c) => c.name.startsWith('pcr0-matches-trusted-build') && c.passed)).toBe(
      true,
    );
  });

  it('fails when PCRs do not match the trusted build', async () => {
    const expectedPcrs = { 0: 'ab'.repeat(48) };
    const r = await verifyAttestation(client({ pcrZero: false, attested: true }), PKG, MACHINE, {
      expectedPcrs,
    });
    expect(r.ok).toBe(false);
  });
});
