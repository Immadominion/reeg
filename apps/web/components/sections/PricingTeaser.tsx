import { Check } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { cn } from '@/lib/cn';
import { site } from '@/lib/site';

// No invented dollar figures: the model is usage-based and honest, so the tiers describe shape, not
// hard prices, until real numbers exist (see docs/05-business/business-model.md).
const TIERS = [
  {
    name: 'Usage-based',
    price: 'Free to start',
    note: 'Pay as you store and anchor',
    features: [
      'Unlimited environments',
      'Snapshot, restore, and resume',
      'Independent verification',
      'Community support',
    ],
    cta: { label: 'Start building', href: site.appUrl },
    highlight: false,
  },
  {
    name: 'Team',
    price: 'Per seat + usage',
    note: 'For multi-operator teams',
    features: [
      'Everything in Usage-based',
      'Share and fork with teammates',
      'Grant and revoke access',
      'Compliance-evidence exports',
    ],
    cta: { label: 'Start building', href: site.appUrl },
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    note: 'For audit and regulation',
    features: [
      'Everything in Team',
      'EU AI Act record-keeping',
      'SSO and audit support',
      'SLAs and dedicated support',
    ],
    cta: { label: 'Talk to us', href: `mailto:${site.email.hello}` },
    highlight: false,
  },
];

export function PricingTeaser() {
  return (
    <section id="pricing" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            align="center"
            eyebrow="Pricing"
            title="Pay for what you keep and prove."
            description="Usage-based and honest. You pay for snapshots stored and anchored, which maps to our real Walrus and Sui costs plus a margin. We never hold your data hostage; the record is yours and verifiable without us."
          />
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.06} className="h-full">
              <div
                className={cn(
                  'flex h-full flex-col rounded-lg border bg-card p-7',
                  tier.highlight ? 'border-accent ring-1 ring-accent' : 'border-border',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold tracking-tight">{tier.name}</h3>
                  {tier.highlight && (
                    <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-4 font-display text-2xl font-semibold tracking-tight">
                  {tier.price}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{tier.note}</p>

                <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-border pt-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <ButtonLink
                  href={tier.cta.href}
                  variant={tier.highlight ? 'primary' : 'secondary'}
                  size="lg"
                  className="mt-7 w-full"
                >
                  {tier.cta.label}
                </ButtonLink>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pricing is directional while we learn. Storage and anchoring are passed through with a
          clear margin.
        </p>
      </Container>
    </section>
  );
}
