import { FileQuestion, Link2Off, Timer } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';

const PROBLEMS = [
  {
    icon: Timer,
    title: 'Rented, then gone',
    body: "The agent's computer is a row in a vendor's database. When the session ends, the workspace is gone. You cannot keep it or reuse it.",
  },
  {
    icon: Link2Off,
    title: 'Impossible to hand off',
    body: 'You can share a transcript of what happened, but not the actual workspace. A teammate or client cannot pick it up exactly as it was.',
  },
  {
    icon: FileQuestion,
    title: 'Nothing to stand behind',
    body: "When a run is questioned, you have the vendor's word for what the agent did. No outside party can check it independently.",
  },
];

export function Problem() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="The problem"
            title="Real work happens in a computer that was never yours."
            description="Agents are the clearest case — they write code, move money, and change records. But the same loss hits any ephemeral environment: a CI job, an eval harness, or a person at a keyboard. The place the work happened is rented from a vendor and vanishes the moment the session ends."
          />
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.title} delay={i * 0.06}>
                <Card className="h-full p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-muted/60 text-muted-foreground">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
