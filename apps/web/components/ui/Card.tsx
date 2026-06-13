import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Flat, hairline-bordered surface. Borders (not shadows) do the separating, per the brand. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-border bg-card', className)}>{children}</div>;
}
