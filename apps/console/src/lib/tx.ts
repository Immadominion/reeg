import { readClient } from './config';

/** Resolve the Machine object created by a transaction (create or fork), or null if it can't be
 *  read back. Waits for the transaction to be indexed first so the object change is present. */
export async function createdMachineId(digest: string): Promise<string | null> {
  try {
    await readClient.waitForTransaction({ digest });
    const tx = await readClient.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const created = tx.objectChanges?.find(
      (change) => change.type === 'created' && change.objectType.endsWith('::machine::Machine'),
    );
    return created && created.type === 'created' ? created.objectId : null;
  } catch {
    return null;
  }
}

/** A calm, plain-language message for a failed wallet action. Never leaks a raw chain error. */
export function txErrorMessage(error: unknown, action: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|cancel|denied|user refused/i.test(message)) {
    return 'Cancelled in your wallet.';
  }
  if (/insufficient|gas|balance|budget/i.test(message)) {
    return `Not enough SUI to ${action}. Top up the connected wallet and try again.`;
  }
  return `Could not ${action}. Please try again.`;
}
