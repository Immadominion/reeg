import { MoveRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { site } from '@/lib/site';

// Closing band, dark for contrast against the light page above it. `dark` flips the tokens, so the
// primary button becomes a light pill on near-black, which reads as the strongest CTA on the page.
export function FinalCta() {
  return (
    <section className="dark bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-1/2 top-1/2 h-[420px] w-[820px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.16]"
            style={{ background: 'radial-gradient(closest-side, var(--accent), transparent)' }}
          />
          <div className="bg-grid absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black,transparent)]" />
        </div>

        <Container className="flex flex-col items-center py-24 text-center sm:py-32">
          <Reveal>
            <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              Own the computer your agents work in.
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Open any shared environment and verify it in your browser, no account required. Start
              building when you are ready.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <ButtonLink href={site.appUrl} size="lg" className="w-full sm:w-auto">
                Start building
                <MoveRight className="h-[18px] w-[18px]" />
              </ButtonLink>
              <ButtonLink
                href={site.docsUrl}
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                Read the docs
              </ButtonLink>
            </div>
          </Reveal>
        </Container>
      </div>
    </section>
  );
}
