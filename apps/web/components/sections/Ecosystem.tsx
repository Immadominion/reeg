import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { cn } from '@/lib/cn';

// Truthful items are solid chips. Aspirational items are clearly labelled "Applying" with a dashed
// border, never presented as already secured.
// TODO(claims): when any "applying" item is confirmed, flip `status` to 'live' and drop the label.
type Badge = { name: string; status: 'live' | 'applying' };

const BUILT_ON: Badge[] = [
  { name: 'Sui', status: 'live' },
  { name: 'Walrus', status: 'live' },
  { name: 'Seal', status: 'live' },
  { name: 'Mysten Labs stack', status: 'live' },
];

const PROGRAMS: Badge[] = [
  { name: 'Sui Overflow 2025', status: 'live' },
  { name: 'NVIDIA Inception', status: 'applying' },
];

function BadgeChip({ badge }: { badge: Badge }) {
  const applying = badge.status === 'applying';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
        applying
          ? 'border border-dashed border-border text-muted-foreground'
          : 'border border-border bg-card text-foreground',
      )}
    >
      {applying && (
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Applying</span>
      )}
      {badge.name}
    </span>
  );
}

export function Ecosystem() {
  return (
    <section className="border-y border-border bg-muted/30 py-20 sm:py-28">
      <Container className="flex flex-col items-center gap-12">
        <Reveal>
          <SectionHeading
            align="center"
            eyebrow="In good company"
            title="A flagship app for the AI OS on Walrus."
            description="Reeg stores every environment on Walrus, gates ownership with a Sui object, and encrypts with Seal before anything leaves your machine. Built in the open, in the Sui ecosystem."
          />
        </Reveal>

        <Reveal delay={0.06} className="w-full">
          <div className="flex flex-col items-center gap-10">
            <div className="flex flex-col items-center gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Built on
              </span>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {BUILT_ON.map((b) => (
                  <BadgeChip key={b.name} badge={b} />
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Programs &amp; recognition
              </span>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {PROGRAMS.map((b) => (
                  <BadgeChip key={b.name} badge={b} />
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
