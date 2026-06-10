import { sameAddress } from './format';

export interface ForkAvailability {
  /** Whether the connected wallet may fork this environment right now. */
  canFork: boolean;
  /** A calm, human reason — shown whether or not forking is available. */
  hint: string;
}

/**
 * Decide whether the connected wallet may fork an environment, and the reason to show. Forking is
 * an owner-only on-chain action (only the owner can reference their owned Machine in a transaction)
 * and only meaningful once there is a snapshot to branch from. Pure, so the gating is unit-tested
 * without the wallet hooks.
 */
export function forkAvailability(
  connectedAddress: string | undefined,
  ownerAddress: string,
  checkpointCount: bigint,
): ForkAvailability {
  if (!connectedAddress) {
    return { canFork: false, hint: 'Connect the owner wallet to fork from this environment.' };
  }
  if (!sameAddress(connectedAddress, ownerAddress)) {
    return { canFork: false, hint: 'Only the owner can fork this environment.' };
  }
  if (checkpointCount <= 0n) {
    return {
      canFork: false,
      hint: 'Take a snapshot before forking — a fork branches from the latest one.',
    };
  }
  return {
    canFork: true,
    hint: 'Creates a new environment from the latest snapshot, with provable lineage to this one.',
  };
}

/** Map a fork transaction failure to a calm message; a wallet rejection is not an error to dwell on. */
export function forkErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancel/i.test(text)) {
    return 'Fork cancelled.';
  }
  return 'Could not fork this environment right now. Please try again.';
}
