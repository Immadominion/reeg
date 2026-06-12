import { cn } from '../../lib/cn';

/** The Reeg mark: a box within a box — the environment you own, with the snapshot inside it.
 *  Monochrome via currentColor so it adapts to light/dark. Matches the marketing Logo. */
export function Logo({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[22px] w-[22px] text-foreground"
        aria-hidden="true"
      >
        <rect
          x="2.6"
          y="2.6"
          width="18.8"
          height="18.8"
          rx="5.2"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <rect x="7.4" y="7.4" width="9.2" height="9.2" rx="2.6" fill="currentColor" />
      </svg>
      {withWordmark ? (
        <span className="font-display text-lg font-semibold tracking-tight">Reeg</span>
      ) : null}
    </span>
  );
}
