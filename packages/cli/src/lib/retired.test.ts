import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { describe, expect, it } from 'vitest';
import { isRetiredOrFalse } from './retired';

const PKG = `0x${'9'.repeat(64)}`;
const MID = `0x${'4'.repeat(64)}`;

// A stub Sui client whose queryEvents returns a fixed set (or rejects), enough for isRetired.
function clientReturning(events: Record<string, unknown>[]): SuiJsonRpcClient {
  return {
    async queryEvents() {
      return {
        data: events.map((parsedJson) => ({ parsedJson })),
        hasNextPage: false,
        nextCursor: null,
      };
    },
  } as unknown as SuiJsonRpcClient;
}

const retireEvent = {
  machine_id: MID,
  seq: '0',
  blob_id: '0',
  manifest_hash: [],
  payload_hash: [1],
  prev_head: [],
  new_head: [],
  timestamp_ms: '0',
};

describe('isRetiredOrFalse', () => {
  it('is true when a MachineRetired event exists', async () => {
    expect(await isRetiredOrFalse(clientReturning([retireEvent]), PKG, MID)).toBe(true);
  });

  it('is false when there is no retire event', async () => {
    expect(await isRetiredOrFalse(clientReturning([]), PKG, MID)).toBe(false);
  });

  it('fails open: a transient read error returns false, so it never blocks a legitimate checkpoint', async () => {
    const flaky = {
      async queryEvents() {
        throw new Error('ECONNRESET');
      },
    } as unknown as SuiJsonRpcClient;
    expect(await isRetiredOrFalse(flaky, PKG, MID)).toBe(false);
  });
});
