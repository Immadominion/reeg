import { toHex } from '@mysten/sui/utils';

/** JSON.stringify replacer that renders the on-chain types our readers return: bigint -> decimal
 *  string, Uint8Array (hashes, heads) -> hex. Keeps tool output deterministic and agent-readable. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return toHex(value);
  }
  return value;
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value, jsonReplacer, 2);
}

/** Retry idempotent public-RPC reads; testnet fullnodes occasionally reset a connection. */
export async function retry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw lastError;
}
