import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { buildFork, type Machine } from '@reeg/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CONFIG, readClient } from '../lib/config';
import { forkAvailability, forkErrorMessage } from '../lib/fork';
import { navigate } from '../lib/router';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';

/**
 * Owner actions for an environment. Fork is a real, wallet-signed on-chain action: it creates a
 * child environment from the latest snapshot with provable lineage to this one, then opens it.
 * Restore is intentionally a host operation (it rebuilds the working directory and runs the agent),
 * so the Console hands the operator the exact command rather than pretending the browser can do it.
 */
export function ActionsCard({ machine }: { machine: Machine }) {
  const account = useCurrentAccount();
  const { mutateAsync } = useSignAndExecuteTransaction();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { canFork, hint } = forkAvailability(
    account?.address,
    machine.owner,
    machine.checkpointCount,
  );

  async function onFork() {
    setBusy(true);
    setError(null);
    try {
      const result = await mutateAsync({
        transaction: buildFork(CONFIG.packageId, machine.id, machine.policyId),
      });
      // Resolve the new child's id from the transaction's object changes so we can open it. If the
      // lookup is unavailable for any reason, fall back to Home, where the child appears in the
      // owned list after the query refresh below.
      const childId = await childMachineId(result.digest);
      await queryClient.invalidateQueries({ queryKey: ['owned'] });
      navigate(childId ? `/env/${childId}` : '/');
    } catch (e) {
      setError(forkErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const restoreCommand = `reeg restore ${machine.id} --dest ./restored`;

  return (
    <Card>
      <CardBody className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Actions</h2>

        <div className="space-y-1.5">
          <Button variant="secondary" size="sm" onClick={onFork} disabled={!canFork || busy}>
            {busy ? 'Forking…' : 'Fork this environment'}
          </Button>
          <p className="text-xs text-muted-foreground">{hint}</p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground">Recover on another machine</p>
          <p className="text-xs text-muted-foreground">
            Restore rebuilds the working directory from your latest snapshot on any host — your key,
            your environment, anywhere.
          </p>
          <CopyCommand command={restoreCommand} />
        </div>
      </CardBody>
    </Card>
  );
}

/** Look up the Machine created by a fork transaction, or null if it can't be resolved. */
async function childMachineId(digest: string): Promise<string | null> {
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

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
        {command}
      </code>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy restore command"
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
