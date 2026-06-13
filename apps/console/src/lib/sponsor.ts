import { useSignAndExecuteTransaction, useSignTransaction, useSuiClient } from '@mysten/dapp-kit';
import type { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { API_URL } from './config';

interface SponsorResponse {
  bytes: string;
  digest: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`paymaster ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

function isUserRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /reject|denied|cancel|user refused/i.test(message);
}

/**
 * One executor for the Console's on-chain Reeg actions (create, fork, retire, grant, revoke).
 *
 * When the paymaster is configured, gas is sponsored — so a zkLogin user holding no SUI can act for
 * free: build the transaction kind → paymaster `/sponsor` → the user signs the sponsored bytes →
 * paymaster `/execute`. If the paymaster is absent or the sponsor request fails (e.g. it's down, or
 * `ENOKI_SECRET_KEY` isn't set yet), it falls back to a normal wallet-paid sign+execute, so a power
 * user with their own SUI still works. The fallback only happens BEFORE the user signs, so a request
 * is never signed or executed twice. Returns the transaction digest.
 */
export function useExecuteTransaction() {
  const suiClient = useSuiClient();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  return async function execute(
    transaction: Transaction,
    sender: string | undefined,
  ): Promise<{ digest: string }> {
    if (API_URL && sender) {
      let sponsored: SponsorResponse | null = null;
      try {
        const transactionKindBytes = toBase64(
          await transaction.build({ client: suiClient, onlyTransactionKind: true }),
        );
        sponsored = await postJson<SponsorResponse>('/sponsor', { transactionKindBytes, sender });
      } catch (err) {
        // Sponsorship unavailable: fall through to a wallet-paid transaction. (Happens before any
        // signing, so there is no risk of a double sign/execute.)
        if (import.meta.env.DEV) {
          console.warn('reeg: sponsorship unavailable, falling back to wallet gas —', err);
        }
        sponsored = null;
      }
      if (sponsored) {
        // Past this point we never fall back: the user signs once and we execute exactly that.
        const { signature } = await signTransaction({ transaction: sponsored.bytes });
        return postJson<{ digest: string }>('/execute', { digest: sponsored.digest, signature });
      }
    }
    const res = await signAndExecute({ transaction });
    return { digest: res.digest };
  };
}

export { isUserRejection };
