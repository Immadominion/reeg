import type { Grant } from '@reeg/sdk';
import type { ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { SharePanel } from '../components/SharePanel';
import { EmptyState, ErrorState, NotConfigured } from '../components/States';
import { Timeline } from '../components/Timeline';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import { VerifiedBadge, type VerifyState } from '../components/ui/VerifiedBadge';
import type { TimelineEvent } from '../lib/environment';
import { friendlyName, shortId } from '../lib/format';
import { navigate, useRoute } from '../lib/router';
import { useTheme } from '../lib/theme';
import { Home } from './Home';
import { Landing } from './Landing';

// A Storybook-style gallery: every screen and state rendered with mock data, so the whole UI can
// be seen and designed with no wallet and no chain. Reuses the real components wherever they take
// props (Timeline, SharePanel, States, the UI kit) so the gallery cannot drift from production; the
// few container screens that fetch (populated Home/detail, the Verify states) are faithful mocks.
// Registered only in dev (see App.tsx), so it never ships to users.

const OWNER = `0x${'a1'.repeat(32)}`;
const BOB = `0x${'b0'.repeat(32)}`;
const CAROL = `0x${'c2'.repeat(32)}`;
const MACHINE = `0x${'3e'.repeat(32)}`;
const NOW = Date.now();
const hoursAgo = (n: number) => BigInt(NOW - n * 3_600_000);
const noop = () => {};

const EVENTS: TimelineEvent[] = [
  { kind: 'created' },
  { kind: 'checkpoint', seq: 0n, blobId: 1n, timestampMs: hoursAgo(6) },
  { kind: 'grant', grantee: BOB, timestampMs: hoursAgo(4) },
  { kind: 'checkpoint', seq: 1n, blobId: 2n, timestampMs: hoursAgo(2) },
  { kind: 'revoke', grantee: BOB, timestampMs: hoursAgo(1) },
];

const GRANTS: Grant[] = [
  { grantee: OWNER, rights: 3, expiryMs: 0n }, // owner self-grant (filtered out of the people list)
  { grantee: CAROL, rights: 2, expiryMs: BigInt(NOW + 7 * 86_400_000) },
];

const VERIFY_CHECKS = [
  { name: 'provenance-head', passed: true, detail: 'replayed chain matches the on-chain head' },
  { name: 'checkpoint-count', passed: true, detail: '2 checkpoints vs on-chain count 2' },
  { name: 'sequence-contiguous', passed: true, detail: 'checkpoint seqs are 0..n-1' },
  { name: 'manifest-hash', passed: true, detail: 'latest manifest matches the record' },
];

interface Story {
  id: string;
  group: string;
  label: string;
  render: () => ReactNode;
}

const STORIES: Story[] = [
  {
    id: 'landing',
    group: 'Screens',
    label: 'Landing page (front door)',
    render: () => <Landing />,
  },
  {
    id: 'home-empty',
    group: 'Screens',
    label: 'Home — dashboard, empty (not connected)',
    render: () => <Home />,
  },
  {
    id: 'home-populated',
    group: 'Screens',
    label: 'Home — with environments',
    render: () => <HomePopulated />,
  },
  {
    id: 'detail-success',
    group: 'Screens',
    label: 'Environment — populated',
    render: () => <DetailSuccess />,
  },
  {
    id: 'detail-loading',
    group: 'Screens',
    label: 'Environment — loading',
    render: () => <DetailLoading />,
  },
  {
    id: 'detail-error',
    group: 'Screens',
    label: 'Environment — error',
    render: () => (
      <ErrorState
        message="We could not find that environment. Check the link and try again."
        onRetry={noop}
      />
    ),
  },
  {
    id: 'verify-unverified',
    group: 'Verify',
    label: 'Verify — not checked',
    render: () => <MockVerifyCard state="unverified" />,
  },
  {
    id: 'verify-checking',
    group: 'Verify',
    label: 'Verify — checking',
    render: () => <MockVerifyCard state="checking" />,
  },
  {
    id: 'verify-verified',
    group: 'Verify',
    label: 'Verify — verified',
    render: () => <MockVerifyCard state="verified" />,
  },
  {
    id: 'verify-failed',
    group: 'Verify',
    label: 'Verify — failed',
    render: () => <MockVerifyCard state="failed" />,
  },
  {
    id: 'timeline',
    group: 'Components',
    label: 'History timeline',
    render: () => (
      <Card>
        <CardBody>
          <Timeline events={EVENTS} nowMs={NOW} />
        </CardBody>
      </Card>
    ),
  },
  {
    id: 'share-owner',
    group: 'Sharing',
    label: 'Share — as the owner',
    render: () => (
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={GRANTS}
        nowMs={NOW}
        onGrant={noop}
        onRevoke={noop}
      />
    ),
  },
  {
    id: 'share-viewer',
    group: 'Sharing',
    label: 'Share — as a viewer',
    render: () => (
      <SharePanel
        owner={OWNER}
        connectedAddress={BOB}
        grants={GRANTS}
        nowMs={NOW}
        onGrant={noop}
        onRevoke={noop}
      />
    ),
  },
  {
    id: 'share-empty',
    group: 'Sharing',
    label: 'Share — not shared yet',
    render: () => (
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={[{ grantee: OWNER, rights: 3, expiryMs: 0n }]}
        nowMs={NOW}
        onGrant={noop}
        onRevoke={noop}
      />
    ),
  },
  {
    id: 'states',
    group: 'States',
    label: 'Empty / error / not-configured',
    render: () => (
      <div className="space-y-4">
        <EmptyState
          title="No environments yet"
          description="When an agent runs in an environment you own, it shows up here with its full, verifiable history."
        />
        <ErrorState message="We could not load this environment right now." onRetry={noop} />
        <NotConfigured />
      </div>
    ),
  },
  {
    id: 'ui-kit',
    group: 'Components',
    label: 'UI kit (buttons, pills, badges)',
    render: () => <UiKit />,
  },
];

// The preview sandbox: an outer tool chrome (a toolbar with a screen picker) wrapping a framed
// "window" that holds the actual product screen. The wrapper is deliberately distinct from the
// product so a viewer (e.g. a designer) can tell the navigation is a preview tool, not part of the
// UI. Each screen is deep-linkable at #/preview/<id>.
export function Sandbox() {
  const route = useRoute();
  const { theme, toggle } = useTheme();
  const storyId = route.startsWith('/preview/') ? route.slice('/preview/'.length) : '';
  const current = STORIES.find((s) => s.id === storyId) ?? STORIES[0];
  if (!current) {
    return null;
  }
  const index = STORIES.indexOf(current);
  const total = STORIES.length;
  const groups = [...new Set(STORIES.map((s) => s.group))];
  const step = (delta: number) => {
    const next = STORIES[(index + delta + total) % total];
    if (next) {
      navigate(`/preview/${next.id}`);
    }
  };
  const withChrome = current.group === 'Screens';

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <span className="rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-background">
            preview
          </span>
          <span className="text-sm font-semibold text-foreground">Reeg screens</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            design sandbox · not the live product
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => step(-1)}
              aria-label="Previous screen"
            >
              ◀
            </Button>
            <select
              aria-label="Pick a screen"
              value={current.id}
              onChange={(e) => navigate(`/preview/${e.target.value}`)}
              className="h-8 max-w-[15rem] rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {STORIES.filter((s) => s.group === group).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Next screen">
              ▶
            </Button>
            <span className="ml-1 tabular-nums text-xs text-muted-foreground">
              {index + 1}/{total}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{current.label}</span>
          <span aria-hidden="true">·</span>
          <span>{current.group}</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-verified/60" />
            </span>
            <span className="ml-2 truncate rounded bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {routeLabel(current)}
            </span>
          </div>
          {withChrome ? (
            <div className="min-h-[28rem]">
              <Header />
              <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">{current.render()}</main>
            </div>
          ) : (
            <div className="p-6">{current.render()}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// A friendly URL for the window's address bar: the real route for product screens, a component
// tag for the rest.
function routeLabel(s: Story): string {
  if (s.id === 'landing' || s.id.startsWith('home')) {
    return '/';
  }
  if (s.id.startsWith('detail')) {
    return '/env/0x3e3e…3e3e';
  }
  return `component · ${s.id}`;
}

// Mirrors VerifyPanel's visual states (the real one fetches, so it can't render offline).
function MockVerifyCard({ state }: { state: VerifyState }) {
  const message: Record<VerifyState, string> = {
    verified: 'Verified independently. Nothing here was changed after the fact.',
    failed: 'This history could not be verified. Something does not match the record.',
    checking: 'Checking the full history against public records.',
    unverified: 'Check this history yourself. No Reeg server is needed.',
  };
  const checks =
    state === 'failed'
      ? VERIFY_CHECKS.map((c, i) =>
          i === 0
            ? { ...c, passed: false, detail: 'replayed chain does NOT match the on-chain head' }
            : c,
        )
      : VERIFY_CHECKS;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <VerifiedBadge state={state} />
          <Button variant="secondary" size="sm" disabled={state === 'checking'}>
            {state === 'checking' ? 'Checking…' : 'Verify independently'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{message[state]}</p>
        {(state === 'verified' || state === 'failed') && (
          <ul className="space-y-1 rounded-lg bg-muted p-3 font-mono text-xs">
            {checks.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span className={c.passed ? 'text-verified' : 'text-destructive'}>
                  {c.passed ? 'ok' : 'fail'}
                </span>
                <span className="text-muted-foreground">
                  {c.name} — {c.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// Faithful reconstruction of the populated environment detail (the real page fetches from chain).
function DetailSuccess() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{friendlyName(MACHINE)}</h1>
          <StatusPill label="Idle" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Avatar id={OWNER} />
          <span>Owned by {shortId(OWNER)}</span>
          <span aria-hidden="true">·</span>
          <span>2 snapshots</span>
        </div>
      </header>
      <MockVerifyCard state="verified" />
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <Card>
          <CardBody>
            <h2 className="mb-4 text-sm font-semibold text-foreground">History</h2>
            <Timeline events={EVENTS} nowMs={NOW} />
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
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={GRANTS}
        nowMs={NOW}
        onGrant={noop}
        onRevoke={noop}
      />
    </div>
  );
}

function DetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function HomePopulated() {
  const ids = [MACHINE, `0x${'7d'.repeat(32)}`, `0x${'4c'.repeat(32)}`];
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your environments</h1>
        <p className="text-sm text-muted-foreground">
          Git tracks code. Reeg tracks the environment where the work happened. Open one to see its
          history and verify it yourself.
        </p>
      </section>
      <ul className="space-y-2">
        {ids.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-muted"
            >
              <span className="font-medium text-foreground">{friendlyName(id)}</span>
              <span className="font-mono text-xs text-muted-foreground">{shortId(id)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UiKit() {
  return (
    <div className="space-y-6">
      <Row label="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
      </Row>
      <Row label="Status pills">
        <StatusPill label="Idle" />
        <StatusPill label="Running" tone="accent" />
        <StatusPill label="Forked" tone="warning" />
      </Row>
      <Row label="Verified badge">
        <VerifiedBadge state="unverified" />
        <VerifiedBadge state="checking" />
        <VerifiedBadge state="verified" />
        <VerifiedBadge state="failed" />
      </Row>
      <Row label="Avatars">
        <Avatar id={OWNER} />
        <Avatar id={BOB} />
        <Avatar id={CAROL} />
      </Row>
      <Row label="Skeleton">
        <Skeleton className="h-8 w-48" />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
