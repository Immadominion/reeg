import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { buildFork, buildRetire, type Machine } from '@reeg/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, GitFork, PowerOff } from 'lucide-react';
import { useState } from 'react';
import { CONFIG } from '../lib/config';
import { forkAvailability, forkErrorMessage } from '../lib/fork';
import { sameAddress } from '../lib/format';
import { navigate } from '../lib/router';
import { createdMachineId, txErrorMessage } from '../lib/tx';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';

/**
 * Owner actions for an environment. Fork and Retire are real, wallet-signed on-chain actions; the
 * Console performs them in the browser. Restore is a host operation (it rebuilds the working
 * directory and runs the agent), so the Console hands the operator the exact command rather than
 * pretending the browser can do it.
 */
export function ActionsCard({ machine, retired }: { machine: Machine; retired?: boolean }) {
  const account = useCurrentAccount();
  const { mutateAsync } = useSignAndExecuteTransaction();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'fork' | 'retire' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  const isOwner = Boolean(account && sameAddress(account.address, machine.owner));
  const { canFork, hint } = forkAvailability(
    account?.address,
    machine.owner,
    machine.checkpointCount,
  );

  async function onFork() {
    setBusy('fork');
    setError(null);
    try {
      const result = await mutateAsync({
        transaction: buildFork(CONFIG.packageId, machine.id, machine.policyId),
      });
      const childId = await createdMachineId(result.digest);
      await queryClient.invalidateQueries({ queryKey: ['owned-machines'] });
      navigate(childId ? `/env/${childId}` : '/');
    } catch (e) {
      setError(forkErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onRetire() {
    setBusy('retire');
    setError(null);
    try {
      await mutateAsync({ transaction: buildRetire(CONFIG.packageId, machine.id) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['retired', machine.id] }),
        queryClient.invalidateQueries({ queryKey: ['environment', machine.id] }),
        queryClient.invalidateQueries({ queryKey: ['verify', machine.id] }),
      ]);
      setConfirmRetire(false);
    } catch (e) {
      setError(txErrorMessage(e, 'retire this environment'));
    } finally {
      setBusy(null);
    }
  }

  const restoreCommand = `reeg restore ${machine.id} --dest ./restored`;

  return (
    <Card>
      <CardBody className="space-y-5">
        <h2 className="text-sm font-semibold tracking-tight">Actions</h2>

        <div className="space-y-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={onFork}
            disabled={!canFork || busy !== null}
            className="w-full"
          >
            <GitFork className="h-4 w-4" />
            {busy === 'fork' ? 'Forking…' : 'Fork this environment'}
          </Button>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium text-foreground">Recover on another machine</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Restore rebuilds the working directory from your latest snapshot on any host — your key,
            your environment, anywhere.
          </p>
          <CopyCommand command={restoreCommand} />
        </div>

        {isOwner && !retired ? (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-foreground">Retire</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Mark this environment permanently retired. It writes a verifiable end-of-life onto its
              history, and cannot be undone.
            </p>
            {confirmRetire ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onRetire}
                  disabled={busy !== null}
                  className="flex-1"
                >
                  <PowerOff className="h-4 w-4" />
                  {busy === 'retire' ? 'Retiring…' : 'Confirm retire'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRetire(false)}
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRetire(true)}
                className="w-full border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <PowerOff className="h-4 w-4" />
                Retire environment
              </Button>
            )}
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardBody>
    </Card>
  );
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="tnum flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
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
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
