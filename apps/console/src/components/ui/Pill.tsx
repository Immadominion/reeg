import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** A glassy status chip with an optional live dot. Quiet by default; use `tone` for emphasis.
 *  Mirrors the marketing Pill. For the verification state specifically, use VerifiedBadge. */
export function Pill({
  children,
  dot = false,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  dot?: boolean;
  tone?: 'neutral' | 'accent' | 'verified' | 'warning';
  className?: string;
}) {
  const dotColor: Record<string, string> = {
    neutral: 'bg-muted-foreground',
    accent: 'bg-accent',
    verified: 'bg-verified',
    warning: 'bg-warning',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur',
        className,
      )}
    >
      {dot ? (
        <span className="relative grid h-2 w-2 place-items-center">
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none',
              dotColor[tone],
            )}
          />
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor[tone])} />
        </span>
      ) : null}
      {children}
    </span>
  );
}
