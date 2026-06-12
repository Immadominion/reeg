import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Fade-and-rise on enter, staggered by `delay`. Honors prefers-reduced-motion (renders the
 *  content directly with no transform). Mirrors the marketing Reveal. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
