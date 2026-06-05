import { cn } from '../lib/cn';
import type { TimelineEvent } from '../lib/environment';
import { eventTitle, relativeTime, shortId, snapshotLabel } from '../lib/format';

// A scannable commit-style history. Each event reads as a plain action; no chain terms appear.
export function Timeline({ events, nowMs }: { events: TimelineEvent[]; nowMs: number }) {
  return (
    <ol className="relative ml-3 border-l border-border">
      {events.map((event, i) => (
        <li key={`${event.kind}-${event.seq ?? i}`} className="relative pb-6 pl-6 last:pb-0">
          <Dot kind={event.kind} />
          <div className="text-sm font-medium text-foreground">{eventTitle(event.kind)}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            <Meta event={event} nowMs={nowMs} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Meta({ event, nowMs }: { event: TimelineEvent; nowMs: number }) {
  const when = event.timestampMs ? relativeTime(Number(event.timestampMs), nowMs) : null;
  if (event.kind === 'checkpoint') {
    return (
      <span>
        {snapshotLabel(event.seq ?? 0n)}
        {when ? ` · ${when}` : ''}
      </span>
    );
  }
  if (event.kind === 'grant' || event.kind === 'revoke') {
    const who = event.grantee ? shortId(event.grantee) : 'someone';
    const verb = event.kind === 'grant' ? 'with' : 'for';
    return (
      <span>
        {verb} {who}
        {when ? ` · ${when}` : ''}
      </span>
    );
  }
  if (event.kind === 'fork' && event.parentId) {
    return <span>from {shortId(event.parentId)}</span>;
  }
  return <span>The start of this environment</span>;
}

function Dot({ kind }: { kind: TimelineEvent['kind'] }) {
  return (
    <span
      className={cn(
        'absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-background',
        kind === 'checkpoint'
          ? 'bg-accent'
          : kind === 'fork'
            ? 'bg-warning'
            : kind === 'grant'
              ? 'bg-verified'
              : kind === 'revoke'
                ? 'bg-destructive'
                : 'bg-muted-foreground',
      )}
      aria-hidden="true"
    />
  );
}
