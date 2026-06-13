import { MoveRight } from 'lucide-react';
import { ProductPanel } from '@/components/sections/ProductPanel';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { site } from '@/lib/site';

// The hero's background (glow + grid) lives at page level in <TopGlow/> so it sits behind the
// transparent header; the body reads as one continuous light surface.
export function Hero() {
  return (
    <section id="top">
      <Container className="flex flex-col items-center px-5 pb-20 pt-16 text-center sm:pt-24">
        <Reveal>
          <h1 className="max-w-3xl text-balance text-[2.5rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            GitHub for AI agents.
          </h1>
        </Reveal>

        <Reveal delay={0.05}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Snapshot an agent's whole environment, prove exactly what it did, then share, fork, or
            restore it anywhere. You own it, on no one's server.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href={site.appUrl} size="lg" className="w-full sm:w-auto">
              Start building
              <MoveRight className="h-[18px] w-[18px]" />
            </ButtonLink>
            <ButtonLink href="#proof" variant="secondary" size="lg" className="w-full sm:w-auto">
              See how proof works
            </ButtonLink>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mt-4 text-xs text-muted-foreground">
            No account needed to open and verify a shared environment.
          </p>
        </Reveal>

        <Reveal delay={0.2} className="w-full">
          <div className="mx-auto mt-14 w-full max-w-3xl text-left">
            <ProductPanel />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
