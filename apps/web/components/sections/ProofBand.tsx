import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

// The real checks the Console runs, reused verbatim so the marketing claim matches the product.
const CHECKS = [
  { name: 'provenance-head', detail: 'replayed chain matches the on-chain head' },
  { name: 'checkpoint-count', detail: '2 checkpoints vs on-chain count 2' },
  { name: 'sequence-contiguous', detail: 'checkpoint seqs are 0..n-1' },
  { name: 'manifest-hash', detail: 'latest manifest matches the record' },
];

// The emotional peak, rendered as a full-bleed dark band: the `dark` class flips every token inside
// to its dark value, so the same components read as a near-black surface.
export function ProofBand() {
  return (
    <section id="proof" className="dark scroll-mt-20 bg-background text-foreground">
      <div className="relative overflow-hidden">
        {/* A soft verified-green glow, so "Verified" feels earned rather than decorative. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            className="absolute right-[6%] top-[-120px] h-[460px] w-[620px] max-w-[110vw] rounded-full opacity-[0.14]"
            style={{ background: 'radial-gradient(closest-side, var(--verified), transparent)' }}
          />
          <div className="bg-grid absolute inset-0 opacity-[0.4] [mask-image:radial-gradient(ellipse_70%_60%_at_70%_0%,black,transparent)]" />
        </div>

        <Container className="grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-2">
          <Reveal>
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Proof, not promises
              </span>
              <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                A record anyone can check, with Reeg switched off.
              </h2>
              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Anyone you choose can re-walk a run&apos;s entire history against public records and
                confirm nothing was changed after the fact. The check runs in their browser and
                needs no Reeg server. That is what makes &ldquo;Verified&rdquo; mean something.
              </p>
              <ul className="mt-7 flex flex-col gap-3 text-sm">
                {[
                  'Independent: no Reeg server in the trust path',
                  'Durable: the record outlives any one vendor',
                  'For free: proof rides along with ownership',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-foreground">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            {/* The verify panel: a calm terminal showing the checks passing. */}
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                <VerifiedBadge />
                <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Verify independently
                </span>
              </div>
              <div className="space-y-3 p-5 font-mono text-xs sm:text-[13px]">
                <p className="text-muted-foreground">
                  Checking the full history against public records...
                </p>
                <ul className="space-y-1.5">
                  {CHECKS.map((c) => (
                    <li key={c.name} className="flex gap-2.5">
                      <span className="font-semibold text-verified">ok</span>
                      <span className="text-foreground">{c.name}</span>
                      <span className="hidden text-muted-foreground sm:inline">: {c.detail}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-muted-foreground">
                  <span className="text-verified">4 checks passed</span>
                  <span>Reeg servers: offline</span>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </div>
    </section>
  );
}
