'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

// A single, reusable on-enter fade-up. ease-out (decelerate on enter), once per element, and fully
// disabled under prefers-reduced-motion (returns the content with no transform). Stagger by passing
// increasing `delay` to siblings. See page-load-animations for the broader recipe set.
const EASE_OUT = [0, 0, 0.2, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
