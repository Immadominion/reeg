import { ArrowLeftRight, Check, GitFork, KeyRound, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';

// The product, as four numbered capability chapters: own / share+fork / move / prove. Crypto is
// always tethered to the benefit; the chain is named only where it earns trust.
const PILLARS = [
  {
    icon: KeyRound,
    title: 'Own it',
    body: "The environment is yours, held as data you control, not a tenant slot on someone else's server.",
    points: [
      'No vendor can change it, lock you out, or delete it',
      'Gated by an object you hold on Sui',
    ],
  },
  {
    icon: GitFork,
    title: 'Share & fork it',
    body: 'Hand a whole live environment to a teammate, or fork a good snapshot to try two directions. The actual workspace, not a transcript.',
    points: [
      'Grant access by person, with optional time limits',
      'Revoke any time, forward-looking',
    ],
  },
  {
    icon: ArrowLeftRight,
    title: 'Move it',
    body: 'Kill it on one host and bring it back on another, byte-identical. Your work travels with you.',
    points: ['Resume on any machine', 'No lock-in to a single vendor or datacenter'],
  },
  {
    icon: ShieldCheck,
    title: 'Prove it',
    body: 'Anyone you choose can re-check the entire history against public records and confirm nothing changed after the fact.',
    points: ['Independent, offline verification', 'No trust in Reeg required'],
  },
];

export function Pillars() {
  return (
    <section id="product" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="What makes it different"
            title="Own it, share it, move it, and prove it."
            description="Reeg does everything a sandbox does: spin up, run commands, write files, snapshot, restore. The difference is what the environment is, and that unlocks four things a rented box cannot give you."
          />
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.title} delay={i * 0.05}>
                <Card className="flex h-full flex-col p-7">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent">
                      <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="font-mono text-sm font-medium tabular-nums text-muted-foreground">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  <ul className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-sm text-foreground">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
