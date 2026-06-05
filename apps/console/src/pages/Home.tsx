import { useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { EmptyState } from '../components/States';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { CONFIG, hasPackageConfigured, readClient } from '../lib/config';
import { friendlyName, shortId } from '../lib/format';
import { navigate } from '../lib/router';

const ID_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;

export function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your environments</h1>
        <p className="text-sm text-muted-foreground">
          The computer your AI agents live in. Open one to see its history and verify it yourself.
        </p>
      </section>

      <OpenById />
      <OwnedEnvironments />
    </div>
  );
}

function OpenById() {
  const [value, setValue] = useState('');
  const valid = ID_PATTERN.test(value.trim());

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (valid) {
      navigate(`/env/${value.trim()}`);
    }
  }

  return (
    <Card>
      <CardBody>
        <h2 className="text-sm font-semibold text-foreground">Open an environment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste an environment link to inspect and verify it. No account needed.
        </p>
        <form onSubmit={onSubmit} className="mt-3 flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x…"
            aria-label="Environment id"
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={!valid}>
            Open
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function OwnedEnvironments() {
  const account = useCurrentAccount();

  const { data, isLoading } = useQuery({
    queryKey: ['owned', account?.address, CONFIG.packageId],
    enabled: Boolean(account?.address) && hasPackageConfigured(),
    queryFn: async () => {
      const res = await readClient.getOwnedObjects({
        owner: account?.address as string,
        filter: { StructType: `${CONFIG.packageId}::machine::Machine` },
        options: { showType: true },
      });
      return res.data.map((o) => o.data?.objectId).filter((id): id is string => Boolean(id));
    },
  });

  if (!account) {
    return (
      <EmptyState
        title="Connect to see your environments"
        description="Connect a wallet to list the environments you own. To inspect a shared one, just open its link above."
      />
    );
  }

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No environments yet"
        description="When an agent runs in an environment you own, it shows up here with its full, verifiable history."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((id) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => navigate(`/env/${id}`)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-muted"
          >
            <span className="font-medium text-foreground">{friendlyName(id)}</span>
            <span className="font-mono text-xs text-muted-foreground">{shortId(id)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
