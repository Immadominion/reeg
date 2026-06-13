import { useCurrentAccount } from '@mysten/dapp-kit';
import { ExternalLink } from 'lucide-react';
import { ActionsCard } from '../components/ActionsCard';
import { AttestationPanel } from '../components/AttestationPanel';
import { Avatar } from '../components/Avatar';
import { ShareCard } from '../components/ShareCard';
import { ErrorState } from '../components/States';
import { Timeline } from '../components/Timeline';
import { Card, CardBody } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import { Reveal } from '../components/ui/Reveal';
import { Skeleton } from '../components/ui/Skeleton';
import { VerifyPanel } from '../components/VerifyPanel';
import { useEnvironment, useRetired } from '../hooks/useEnvironment';
import { explorerUrl } from '../lib/config';
import { friendlyName, sameAddress, shortId } from '../lib/format';
import { isShareable } from '../lib/machine';

export function EnvironmentDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error, refetch } = useEnvironment(id);
  const { data: retired } = useRetired(id);
  const account = useCurrentAccount();
  const nowMs = Date.now();

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (isError || !data) {
    return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  }

  const { machine, events } = data;
  const snapshots = Number(machine.checkpointCount);
  const shareable = isShareable(machine);
  const forked = Boolean(machine.parent);
  const isOwner = Boolean(account && sameAddress(account.address, machine.owner));

  return (
    <div className="space-y-6">
      <Reveal>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar id={machine.id} className="h-12 w-12 text-base" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{friendlyName(id)}</h1>
                {retired ? (
                  <Pill dot tone="warning">
                    Retired
                  </Pill>
                ) : (
                  <Pill dot tone="verified">
                    Active
                  </Pill>
                )}
                {shareable ? (
                  <Pill dot tone="accent">
                    Shareable
                  </Pill>
                ) : null}
                {forked ? (
                  <Pill dot tone="warning">
                    Forked
                  </Pill>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>Owned by {isOwner ? 'you' : shortId(machine.owner)}</span>
                <span aria-hidden="true">·</span>
                <span className="tnum">
                  {snapshots} snapshot{snapshots === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
          <a
            href={explorerUrl('object', machine.id)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View on chain <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </header>
      </Reveal>

      <VerifyPanel id={id} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardBody>
              <h2 className="mb-4 text-sm font-semibold tracking-tight">History</h2>
              <Timeline events={events} nowMs={nowMs} />
            </CardBody>
          </Card>
          <ShareCard machineId={id} nowMs={nowMs} />
        </div>
        <div className="space-y-6">
          <AttestationPanel id={id} />
          <ActionsCard machine={machine} retired={retired} />
        </div>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium">Technical details</summary>
        <dl className="mt-3 space-y-2 rounded-lg border border-border bg-muted/40 p-3 font-mono">
          <Detail
            label="Environment id"
            value={machine.id}
            href={explorerUrl('object', machine.id)}
          />
          <Detail label="Owner" value={machine.owner} href={explorerUrl('object', machine.owner)} />
          {shareable ? (
            <Detail
              label="Access policy"
              value={machine.policyId}
              href={explorerUrl('object', machine.policyId)}
            />
          ) : null}
          {machine.parent ? (
            <Detail
              label="Forked from"
              value={machine.parent}
              href={explorerUrl('object', machine.parent)}
            />
          ) : null}
        </dl>
      </details>
    </div>
  );
}

function Detail({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-28">{label}</dt>
      <dd className="min-w-0">
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all text-foreground hover:text-accent hover:underline"
        >
          {value}
        </a>
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('not a Machine')) {
    return 'We could not find that environment. Check the link and try again.';
  }
  return 'We could not load this environment right now.';
}
