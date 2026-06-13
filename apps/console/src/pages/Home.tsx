import { ConnectModal, useCurrentAccount } from '@mysten/dapp-kit';
import type { Machine } from '@reeg/sdk';
import { ArrowRight, Boxes, Camera, Search, Share2, Wallet } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { CreateEnvironment } from '../components/CreateEnvironment';
import { EmptyState, ErrorState, NotConfigured } from '../components/States';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import { Pill } from '../components/ui/Pill';
import { Reveal } from '../components/ui/Reveal';
import { Skeleton } from '../components/ui/Skeleton';
import { useOwnedMachines } from '../hooks/useEnvironment';
import { hasPackageConfigured } from '../lib/config';
import { friendlyName, shortId } from '../lib/format';
import { isShareable } from '../lib/machine';
import { navigate } from '../lib/router';

const ID_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;

export function Home() {
  if (!hasPackageConfigured()) {
    return (
      <Container className="py-16">
        <NotConfigured />
      </Container>
    );
  }
  return (
    <Container className="py-8 sm:py-10">
      <Dashboard />
    </Container>
  );
}

function Dashboard() {
  const account = useCurrentAccount();
  const { data: machines, isLoading, isError, refetch } = useOwnedMachines();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Environments</h1>
        {account && machines && machines.length > 0 ? <CreateEnvironment size="md" /> : null}
      </div>

      {!account ? (
        <ConnectPrompt />
      ) : isLoading ? (
        <GridSkeleton />
      ) : isError ? (
        <ErrorState
          message="Could not load your environments from the network. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : !machines || machines.length === 0 ? (
        <EmptyState
          title="No environments yet"
          description="Create your first environment to snapshot what your agent does. Own it, share it, and prove exactly what happened."
          action={<CreateEnvironment size="md" />}
        />
      ) : (
        <>
          <Stats machines={machines} />
          <MachineGrid machines={machines} />
        </>
      )}

      <InspectAny />
    </div>
  );
}

function ConnectPrompt() {
  return (
    <Card className="shadow-panel">
      <div className="flex flex-col items-center gap-5 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
          <Wallet className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">Connect your wallet</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            Connect to create and manage the environments you own. To inspect a shared one, paste
            its link below. No wallet needed.
          </p>
        </div>
        <ConnectModal trigger={<Button size="lg">Connect wallet</Button>} />
      </div>
    </Card>
  );
}

function Stats({ machines }: { machines: Machine[] }) {
  const environments = machines.length;
  const snapshots = machines.reduce((sum, m) => sum + Number(m.checkpointCount), 0);
  const shareable = machines.filter(isShareable).length;
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <Stat icon={Boxes} label="Environments" value={environments} />
      <Stat icon={Camera} label="Snapshots" value={snapshots} />
      <Stat icon={Share2} label="Shareable" value={shareable} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: number }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="tnum mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </Card>
  );
}

function MachineGrid({ machines }: { machines: Machine[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {machines.map((machine, index) => (
        <MachineCard key={machine.id} machine={machine} index={index} />
      ))}
    </div>
  );
}

function MachineCard({ machine, index }: { machine: Machine; index: number }) {
  const snapshots = Number(machine.checkpointCount);
  const shareable = isShareable(machine);
  const forked = Boolean(machine.parent);
  return (
    <Reveal delay={Math.min(index * 0.04, 0.2)}>
      <button
        type="button"
        onClick={() => navigate(`/env/${machine.id}`)}
        className="group flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-5 text-left transition-all duration-150 hover:border-foreground/20 hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <Avatar id={machine.id} className="h-9 w-9 text-sm" />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
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
        </div>
        <div>
          <div className="font-medium tracking-tight">{friendlyName(machine.id)}</div>
          <div className="tnum mt-0.5 font-mono text-xs text-muted-foreground">
            {shortId(machine.id)}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="tnum">
            {snapshots} snapshot{snapshots === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
            Open <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
    </Reveal>
  );
}

function GridSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[148px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function InspectAny() {
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
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Inspect any environment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste an environment link to view and verify it yourself. No wallet needed.
          </p>
        </div>
        <form onSubmit={onSubmit} className="flex gap-2 sm:w-[400px]">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x…"
              aria-label="Environment id"
              className="tnum h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button type="submit" disabled={!valid}>
            Open
          </Button>
        </form>
      </div>
    </Card>
  );
}
