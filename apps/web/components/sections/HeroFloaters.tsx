'use client';

import { Check, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Floating glassy cards that frame the headline (like the Mindset Health reference) but tell a
// coherent Reeg story for the "Dropbox for AI agent environments" positioning: an agent commits a snapshot, it is
// shared with a teammate, and an auditor verifies it independently. Desktop-only (xl+), where the
// margins beside the centered headline have room; on smaller screens the hero stays clean. Entrance
// fades in, then a slow opacity-safe vertical drift gives it life. All disabled under reduced motion.

const EASE_OUT = [0, 0, 0.2, 1] as const;

function Floater({
  children,
  position,
  rotate = 0,
  delay = 0,
  duration = 6,
}: {
  children: ReactNode;
  position: string;
  rotate?: number;
  delay?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  // Outer wrapper owns positioning (incl. any -translate centering); the inner motion element owns
  // the transform animation, so the two never fight over `transform`.
  return (
    <div className={cn('absolute hidden xl:block', position)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, rotate }}
        animate={
          reduce
            ? { opacity: 1, scale: 1, rotate }
            : { opacity: 1, scale: 1, rotate, y: [0, -9, 0] }
        }
        transition={
          reduce
            ? { duration: 0.4, delay }
            : {
                opacity: { duration: 0.5, delay, ease: EASE_OUT },
                scale: { duration: 0.5, delay, ease: EASE_OUT },
                y: { duration, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.4 },
              }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

function Avatar({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold',
        className,
      )}
    >
      {label}
    </span>
  );
}

const CARD =
  'w-[238px] rounded-lg border border-border bg-card/90 p-3.5 shadow-xl shadow-black/[0.06] backdrop-blur';

export function HeroFloaters() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      {/* top-left: an agent commits a snapshot */}
      <Floater
        position="left-[3%] top-[152px] 2xl:left-[6%]"
        rotate={-3}
        delay={0.35}
        duration={6.5}
      >
        <div className={CARD}>
          <div className="flex items-center gap-2.5">
            <Avatar label="ca" className="bg-foreground font-mono text-background" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">checkout-agent</p>
              <p className="text-[11px] text-muted-foreground">committed · 2m ago</p>
            </div>
          </div>
          <p className="mt-3 truncate font-mono text-[11px] text-foreground">
            fix: handle 429 retries
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[78%] rounded-full bg-foreground" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Snapshot #14 · 142 checks passed</p>
        </div>
      </Floater>

      {/* top-right: a run, independently verified */}
      <Floater
        position="right-[3%] top-[134px] 2xl:right-[6%]"
        rotate={3}
        delay={0.45}
        duration={7}
      >
        <div className={CARD}>
          <div className="flex items-center gap-2.5">
            <Avatar label="ne" className="bg-accent/12 font-mono text-accent" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">nightly-evals</p>
              <p className="text-[11px] text-muted-foreground">Snapshot #8 · Day 3</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[64%] rounded-full bg-verified" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Running · new host</p>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-verified">
              <Check className="h-3 w-3" strokeWidth={3} />
              Verified
            </span>
          </div>
        </div>
      </Floater>

      {/* mid-left: shared with a teammate (dark pill) */}
      <Floater
        position="left-[7%] top-[344px] 2xl:left-[11%]"
        rotate={-3}
        delay={0.6}
        duration={6.8}
      >
        <div className="flex items-center gap-2.5 rounded-full bg-foreground py-1.5 pl-1.5 pr-4 text-background shadow-xl shadow-black/15">
          <Avatar label="D" className="bg-background/15 text-background" />
          <div>
            <p className="text-sm font-semibold leading-tight">Dana</p>
            <p className="text-[11px] leading-tight text-background/60">can resume</p>
          </div>
        </div>
      </Floater>

      {/* mid-right: verified by an outside auditor (accent pill) */}
      <Floater
        position="right-[7%] top-[362px] 2xl:right-[11%]"
        rotate={3}
        delay={0.7}
        duration={6.2}
      >
        <div className="flex items-center gap-2.5 rounded-full bg-accent py-1.5 pl-2.5 pr-4 text-white shadow-xl shadow-accent/25">
          <ShieldCheck className="h-5 w-5 shrink-0" strokeWidth={2.2} />
          <div>
            <p className="text-sm font-semibold leading-tight">auditor</p>
            <p className="text-[11px] leading-tight text-white/75">verified independently</p>
          </div>
        </div>
      </Floater>
    </div>
  );
}
