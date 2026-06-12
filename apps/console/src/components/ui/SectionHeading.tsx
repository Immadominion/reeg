import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** A consistent section opener: a quiet accent eyebrow, a calm display title, and an optional
 *  muted description. Weight-driven, not size-driven (matches the marketing SectionHeading). */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  align = 'left',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow ? (
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-pretty text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {description ? (
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
