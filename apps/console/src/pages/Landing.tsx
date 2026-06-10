import { type FormEvent, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { VerifiedBadge } from '../components/ui/VerifiedBadge';
import { navigate } from '../lib/router';

const ID_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;

const PILLARS = [
  {
    title: 'Own it',
    body: 'Each environment is an object you hold on Sui, not a tenant slot on someone else’s server.',
  },
  {
    title: 'Share it',
    body: 'Grant a teammate access by address, with a time limit if you like, and revoke it when you’re done.',
  },
  {
    title: 'Move it',
    body: 'Kill the host and restore the run byte-identical on a fresh one. Your work travels with you.',
  },
  {
    title: 'Prove it',
    body: 'Re-check the entire history against public records, with Reeg switched off. No trust in us required.',
  },
];

/**
 * The front door. A calm hero that says what Reeg is in one line, the four things that make it
 * different, and the one wow that needs no account: independent, offline verification. Two ways in:
 * open any environment by link, or connect a wallet (the header button). On brand tokens only.
 */
export function Landing() {
  return (
    <div className="space-y-20 py-8">
      <Hero />
      <Pillars />
      <ProveStrip />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
        Live on Sui testnet
      </span>
      <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        The computer your AI agents live in.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
        Own it, share it, move it, and prove it. Every run is an environment you hold, portable
        across hosts and independently verifiable, even with Reeg offline.
      </p>
      <div className="mt-8">
        <OpenBox />
        <p className="mt-2 text-xs text-muted-foreground">
          No account needed to open and verify a shared environment.
        </p>
      </div>
    </section>
  );
}

function OpenBox() {
  const [value, setValue] = useState('');
  const valid = ID_PATTERN.test(value.trim());

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (valid) {
      navigate(`/env/${value.trim()}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-md gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste an environment link (0x…)"
        aria-label="Environment id"
        className="h-11 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="submit" disabled={!valid} className="h-11">
        Open
      </Button>
    </form>
  );
}

function Pillars() {
  return (
    <section className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
      {PILLARS.map((p) => (
        <Card key={p.title}>
          <CardBody className="space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">{p.title}</h2>
            <p className="text-sm text-muted-foreground">{p.body}</p>
          </CardBody>
        </Card>
      ))}
    </section>
  );
}

function ProveStrip() {
  return (
    <section className="mx-auto max-w-2xl">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-10 text-center">
          <VerifiedBadge state="verified" />
          <h2 className="text-2xl font-semibold tracking-tight">Proof, not promises.</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Anyone can re-walk a run’s entire history against public records and confirm nothing was
            changed after the fact. The check runs in your browser and needs no Reeg server, which
            is what makes “Verified” mean something.
          </p>
        </CardBody>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-2xl border-t border-border pt-8 text-center text-sm text-muted-foreground">
      Owned on Sui · stored on Walrus · encrypted with Seal · verifiable by anyone.
    </footer>
  );
}
