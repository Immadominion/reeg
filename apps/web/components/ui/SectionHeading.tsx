import { cn } from '@/lib/cn';

/** The consistent section header: a quiet uppercase eyebrow, a calm title, and an optional lead.
 *  Weight and the eyebrow carry the emphasis, not giant size jumps (brand typography rule). */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          {eyebrow}
        </span>
      )}
      <h2 className="text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description && (
        <p
          className={cn(
            'text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg',
            align === 'center' ? 'max-w-2xl' : 'max-w-xl',
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
