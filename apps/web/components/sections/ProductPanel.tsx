import { Camera, ListChecks, Plus, ServerCog, UserPlus } from 'lucide-react';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { cn } from '@/lib/cn';

// A faithful, self-contained mock of a Console environment-detail screen, used as the hero product
// shot. It mirrors the real app's language and the "hide the blockchain" rule: a friendly name, a
// Verified badge, and a plain-English history. No hashes or addresses in the main flow.

type Event = {
  icon: typeof Plus;
  title: string;
  meta: string;
  time: string;
};

const EVENTS: Event[] = [
  {
    icon: Plus,
    title: 'Created environment',
    meta: 'Ubuntu · Python 3.12 · Node 22',
    time: '1h ago',
  },
  { icon: ListChecks, title: 'Ran the test suite', meta: '142 passed', time: '24m ago' },
  { icon: Camera, title: 'Saved snapshot', meta: 'Snapshot #14', time: '18m ago' },
  { icon: UserPlus, title: 'Shared with Dana', meta: 'Can resume', time: '6m ago' },
  { icon: ServerCog, title: 'Resumed on a new machine', meta: 'Byte-identical', time: 'just now' },
];

export function ProductPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        'shadow-[6px_6px_0_0_rgba(17,17,17,0.06)]',
        className,
      )}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-destructive/50" />
          <span className="h-3 w-3 rounded-full bg-warning/50" />
          <span className="h-3 w-3 rounded-full bg-verified/50" />
        </span>
        <span className="mx-auto truncate rounded-md bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
          app.reeg.xyz/env/nightly-evals
        </span>
      </div>

      {/* Environment header */}
      <div className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-sm font-semibold text-accent"
              aria-hidden="true"
            >
              NE
            </span>
            <div>
              <h3 className="text-base font-semibold tracking-tight">nightly-evals</h3>
              <p className="text-xs text-muted-foreground">Owned by you · 2 snapshots</p>
            </div>
          </div>
          <VerifiedBadge />
        </div>

        {/* History timeline */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            History
          </p>
          <ol className="relative space-y-4 pl-1">
            <span
              className="absolute bottom-3 left-[15px] top-3 w-px bg-border"
              aria-hidden="true"
            />
            {EVENTS.map((e) => {
              const Icon = e.icon;
              return (
                <li key={e.title} className="relative flex items-center gap-3">
                  <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                    <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {e.title}
                    <span className="ml-2 font-normal text-muted-foreground">{e.meta}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {e.time}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Proof footer */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-verified/25 bg-verified/[0.06] px-4 py-3">
          <p className="text-sm text-foreground">
            Verified independently. <span className="text-muted-foreground">4 checks passed.</span>
          </p>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            no server needed
          </span>
        </div>
      </div>
    </div>
  );
}
