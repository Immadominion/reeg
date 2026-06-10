import { BuiltOn } from '@/components/sections/BuiltOn';
import { Different } from '@/components/sections/Different';
import { Ecosystem } from '@/components/sections/Ecosystem';
import { FinalCta } from '@/components/sections/FinalCta';
import { Hero } from '@/components/sections/Hero';
import { Pillars } from '@/components/sections/Pillars';
import { PricingTeaser } from '@/components/sections/PricingTeaser';
import { Problem } from '@/components/sections/Problem';
import { ProofBand } from '@/components/sections/ProofBand';
import { Footer } from '@/components/site/Footer';
import { Nav } from '@/components/site/Nav';
import { TopGlow } from '@/components/site/TopGlow';

export default function HomePage() {
  return (
    <div className="relative">
      <TopGlow />
      <Nav />
      <main>
        <Hero />
        <BuiltOn />
        <Problem />
        <Pillars />
        <ProofBand />
        <Different />
        <Ecosystem />
        <PricingTeaser />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
