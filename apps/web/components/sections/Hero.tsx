import { MoveRight } from 'lucide-react';
import { HeroFloaters } from '@/components/sections/HeroFloaters';
import { ProductPanel } from '@/components/sections/ProductPanel';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { site } from '@/lib/site';

// The hero's background (grainy aurora + grid) lives at page level in <TopGlow/> so it sits behind
// the transparent header; the body reads as one continuous light surface. <HeroFloaters/> frames the
// headline with glassy product cards on wide screens.
export function Hero() {
  return (
    <section id="top" className="relative isolate">
      <HeroFloaters />
      <Container className="relative z-10 flex flex-col items-center px-5 pb-20 pt-16 text-center sm:pt-24">
        <Reveal>
          <h1 className="max-w-3xl text-balance text-[2.5rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Git tracks code. Reeg tracks the environment where the work happened.
          </h1>
        </Reveal>

        <Reveal delay={0.05}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Reeg is infrastructure for portable computing environments. We started with AI agents
            because they're the fastest-growing source of ephemeral work, but the underlying system
            can preserve and move any environment.
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
