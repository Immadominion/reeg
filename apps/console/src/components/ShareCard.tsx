import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import type { Transaction } from '@mysten/sui/transactions';
import { buildGrant, buildRevoke } from '@reeg/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAccess } from '../hooks/useEnvironment';
import { CONFIG } from '../lib/config';
import { type GrantRole, SharePanel } from './SharePanel';
import { Card, CardBody } from './ui/Card';
import { Skeleton } from './ui/Skeleton';

const RIGHTS_VIEW = 1;
const RIGHTS_RESTORE = 2;

/**
 * Data + wallet wiring for the share panel. Reads current access from Sui, signs grant and revoke
 * with the connected wallet (the owner), and refreshes after. Renders nothing for a legacy
 * owner-only Machine that has no shared policy.
 */
export function ShareCard({ machineId, nowMs }: { machineId: string; nowMs: number }) {
  const { data: access, isLoading } = useAccess(machineId);
  const account = useCurrentAccount();
  const { mutateAsync } = useSignAndExecuteTransaction();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <Skeleton className="h-24 w-full" />
        </CardBody>
      </Card>
    );
  }
  if (!access) {
    return null;
  }

  async function submit(transaction: Transaction) {
    setBusy(true);
    try {
      await mutateAsync({ transaction });
      await queryClient.invalidateQueries({ queryKey: ['access', machineId] });
      await queryClient.invalidateQueries({ queryKey: ['environment', machineId] });
    } finally {
      setBusy(false);
    }
  }

  const rightsFor = (role: GrantRole) =>
    role === 'viewer' ? RIGHTS_VIEW : RIGHTS_VIEW | RIGHTS_RESTORE;

  return (
    <SharePanel
      owner={access.owner}
      connectedAddress={account?.address ?? null}
      grants={access.grants}
      nowMs={nowMs}
      busy={busy}
      onGrant={(address, { role, expiryMs }) =>
        submit(
          buildGrant(
            CONFIG.packageId,
            machineId,
            access.policyId,
            address,
            rightsFor(role),
            expiryMs,
          ),
        )
      }
      onRevoke={(address) =>
        submit(buildRevoke(CONFIG.packageId, machineId, access.policyId, address))
      }
    />
  );
}
