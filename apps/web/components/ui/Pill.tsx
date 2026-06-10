import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A small eyebrow/status chip. With `dot`, shows a pulsing status dot (used for "Live on testnet"). */
export function Pill({
  children,
  dot = false,
  className,
}: {
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur',
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-verified" />
        </span>
      )}
      {children}
    </span>
  );
}
