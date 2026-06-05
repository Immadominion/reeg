import type { Grant } from '@reeg/sdk';
import { useState } from 'react';
import { expiryLabel, friendlyName, roleLabel, sameAddress } from '../lib/format';
import { Avatar } from './Avatar';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';

export type GrantRole = 'viewer' | 'restore';
export type GrantExpiry = 'none' | '1d' | '7d' | '30d';

export interface SharePanelProps {
  owner: string;
  connectedAddress: string | null;
  grants: Grant[];
  nowMs: number;
  busy?: boolean;
  onGrant: (address: string, opts: { role: GrantRole; expiryMs: bigint }) => void;
  onRevoke: (address: string) => void;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
const EXPIRY_DAYS: Record<GrantExpiry, number> = { none: 0, '1d': 1, '7d': 7, '30d': 30 };

/**
 * Share an environment with people. People read as avatars and names, never raw addresses; the
 * only place an address appears is the add field, because there is no name service yet. Removing
 * someone is honest about being forward-looking. Only the owner sees the controls; everyone else
 * sees who has access. The actual grant/revoke is signed by the connected wallet in the container.
 */
export function SharePanel({
  owner,
  connectedAddress,
  grants,
  nowMs,
  busy = false,
  onGrant,
  onRevoke,
}: SharePanelProps) {
  const canManage = connectedAddress !== null && sameAddress(connectedAddress, owner);
  const people = grants.filter((g) => !sameAddress(g.grantee, owner));

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">People with access</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Anyone you add can open this environment. The owner always has access.
          </p>
        </div>

        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
        ) : (
          <ul className="space-y-2">
            {people.map((g) => (
              <li
                key={g.grantee}
                className="flex items-center gap-3"
                title={g.grantee /* full address on hover only; not shown as text */}
              >
                <Avatar id={g.grantee} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {friendlyName(g.grantee)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {roleLabel(g.rights)} · {expiryLabel(g.expiryMs, nowMs)}
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRevoke(g.grantee)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && people.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Removing someone stops them unlocking access again. Anyone who already opened this
            environment may keep access to its data, including new snapshots.
          </p>
        )}

        {canManage ? (
          <AddPerson busy={busy} onGrant={onGrant} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {connectedAddress
              ? 'Only the owner can change who has access.'
              : 'Connect the owner wallet to manage sharing.'}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function AddPerson({ busy, onGrant }: { busy: boolean; onGrant: SharePanelProps['onGrant'] }) {
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<GrantRole>('restore');
  const [expiry, setExpiry] = useState<GrantExpiry>('none');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmed = address.trim();
    if (!ADDRESS_RE.test(trimmed)) {
      setError('Enter a full address (0x followed by 64 hex characters).');
      return;
    }
    setError(null);
    const days = EXPIRY_DAYS[expiry];
    const expiryMs = days === 0 ? 0n : BigInt(Date.now() + days * 86_400_000);
    onGrant(trimmed, { role, expiryMs });
    setAddress('');
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <label htmlFor="share-address" className="text-xs font-medium text-foreground">
        Add a person by address
      </label>
      <input
        id="share-address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as GrantRole)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="restore">Can restore</option>
          <option value="viewer">Viewer</option>
        </select>
        <select
          aria-label="Expires"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value as GrantExpiry)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="none">No expiry</option>
          <option value="1d">1 day</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
        </select>
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? 'Sharing…' : 'Share'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
