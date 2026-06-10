import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** The shared content column. One gutter for the whole site so sections never drift. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}
