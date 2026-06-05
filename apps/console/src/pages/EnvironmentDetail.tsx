import { Avatar } from '../components/Avatar';
import { ShareCard } from '../components/ShareCard';
import { ErrorState } from '../components/States';
import { Timeline } from '../components/Timeline';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import { VerifyPanel } from '../components/VerifyPanel';
import { useEnvironment } from '../hooks/useEnvironment';
import { friendlyName, shortId } from '../lib/format';

export function EnvironmentDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error, refetch } = useEnvironment(id);
  const nowMs = Date.now();

  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (isError || !data) {
    return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  }

  const { machine, events } = data;
  const checkpoints = machine.checkpointCount.toString();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{friendlyName(id)}</h1>
          <StatusPill label="Idle" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Avatar id={machine.owner} />
          <span>Owned by {shortId(machine.owner)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {checkpoints} snapshot{checkpoints === '1' ? '' : 's'}
          </span>
        </div>
      </header>

      <VerifyPanel id={id} />

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <Card>
          <CardBody>
            <h2 className="mb-4 text-sm font-semibold text-foreground">History</h2>
            <Timeline events={events} nowMs={nowMs} />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Actions</h2>
            <p className="text-xs text-muted-foreground">
              Resume and fork from a connected wallet arrive next.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" disabled>
                Resume on another machine
              </Button>
              <Button variant="secondary" size="sm" disabled>
                Fork
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <ShareCard machineId={id} nowMs={nowMs} />

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Technical details</summary>
        <div className="mt-2 break-all font-mono">id {id}</div>
      </details>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
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
