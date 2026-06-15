import { Check, Minus } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { cn } from '@/lib/cn';

// sandbox / reeg as booleans. The first rows are parity (we do everything a box does); the lower
// rows are the structural wins ownership makes possible.
const ROWS: { label: string; sandbox: boolean; reeg: boolean }[] = [
  { label: 'Spin up, run commands, write files', sandbox: true, reeg: true },
  { label: 'Snapshot and restore', sandbox: true, reeg: true },
  { label: 'Resume on a different host, byte-identical', sandbox: false, reeg: true },
  { label: 'You own the environment', sandbox: false, reeg: true },
  { label: 'Hand over the live workspace, not a transcript', sandbox: false, reeg: true },
  { label: 'Fork a run to try two directions', sandbox: false, reeg: true },
  { label: 'Anyone can verify it with the vendor offline', sandbox: false, reeg: true },
];

function Mark({ on, accent = false }: { on: boolean; accent?: boolean }) {
  return on ? (
    <Check
      className={cn('h-[18px] w-[18px]', accent ? 'text-accent' : 'text-muted-foreground')}
      strokeWidth={2.5}
      aria-label="Yes"
    />
  ) : (
    <Minus
      className="h-[18px] w-[18px] text-muted-foreground/40"
      strokeWidth={2.5}
      aria-label="No"
    />
  );
}

export function Different() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Why Reeg"
            title="Everything a sandbox does. Plus the one thing it can't."
            description="We took the latency trade on purpose. For a throwaway box for thirty seconds of work, a centralized sandbox is the right tool. For an environment worth owning, sharing, and standing behind, that is Reeg."
          />
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-12 overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-[1fr_4rem_4rem] sm:grid-cols-[1fr_11rem_11rem]">
              {/* Header */}
              <div className="border-b border-border px-4 py-4 sm:px-5" />
              <div className="border-b border-border px-2 py-4 text-center text-xs font-medium text-muted-foreground sm:text-sm">
                <span className="sm:hidden">Sandbox</span>
                <span className="hidden sm:inline">Centralized sandbox</span>
              </div>
              <div className="border-b border-l border-border bg-accent/[0.04] px-2 py-4 text-center text-xs font-semibold text-accent sm:text-sm">
                Reeg
              </div>

              {/* Rows */}
              {ROWS.map((row, i) => {
                const edge = i < ROWS.length - 1 ? 'border-b border-border' : '';
                return (
                  <div key={row.label} className="contents">
                    <div className={cn('px-4 py-4 text-sm text-foreground sm:px-5', edge)}>
                      {row.label}
                    </div>
                    <div className={cn('grid place-items-center px-2 py-4', edge)}>
                      <Mark on={row.sandbox} />
                    </div>
                    <div
                      className={cn(
                        'grid place-items-center border-l border-border bg-accent/[0.04] px-2 py-4',
                        edge,
                      )}
                    >
                      <Mark on={row.reeg} accent />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            A competitor can copy any feature except letting you own the environment, and ownership
            is what makes the rest possible.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
