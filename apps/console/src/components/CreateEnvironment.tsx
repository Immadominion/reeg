import { useCurrentAccount } from '@mysten/dapp-kit';
import { buildCreateSharedMachine } from '@reeg/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { CONFIG } from '../lib/config';
import { navigate } from '../lib/router';
import { useExecuteTransaction } from '../lib/sponsor';
import { createdMachineId, txErrorMessage } from '../lib/tx';
import { Button } from './ui/Button';

/**
 * Create a new environment: one wallet-signed transaction that mints a Machine you own together
 * with its shared access policy, then opens it. Shareable from the start, so the owner can hand a
 * run to a teammate without re-encrypting. The heavy work (running the agent, snapshotting) happens
 * on a host via the engine; this is the on-chain birth of the environment.
 */
export function CreateEnvironment({
  size = 'lg',
  variant = 'primary',
  label = 'New environment',
}: {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
  label?: string;
}) {
  const account = useCurrentAccount();
  const execute = useExecuteTransaction();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create needs a wallet to sign and pay. The dashboard shows a connect prompt in its place.
  if (!account) {
    return null;
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const result = await execute(buildCreateSharedMachine(CONFIG.packageId), account?.address);
      const id = await createdMachineId(result.digest);
      await queryClient.invalidateQueries({ queryKey: ['owned-machines'] });
      navigate(id ? `/env/${id}` : '/');
    } catch (e) {
      setError(txErrorMessage(e, 'create an environment'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button size={size} variant={variant} onClick={onCreate} disabled={busy}>
        <Plus className="h-[18px] w-[18px]" />
        {busy ? 'Creating…' : label}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
