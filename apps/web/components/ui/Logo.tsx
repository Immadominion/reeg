import { cn } from '@/lib/cn';

/** The Reeg wordmark. The mark is a box-in-a-box: the environment (outer) and the snapshot you own
 *  inside it (inner). Monochrome so it adapts to light and dark bands; restraint over a colored logo. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
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
      {showWordmark && (
        <span className="font-display text-lg font-semibold tracking-tight">Reeg</span>
      )}
    </span>
  );
}
