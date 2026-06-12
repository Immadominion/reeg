import { cn } from '../../lib/cn';

/** The Reeg mark (public/transparent-bg-logo.svg), inlined so it inherits `currentColor` and
 *  adapts to light/dark. Square glyph; size it with className (defaults to 22px). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 480"
      fill="none"
      className={cn('h-[22px] w-[22px] text-foreground', className)}
      aria-hidden="true"
    >
      <path
        d="M116 147V214H161.5L116 248V333.5H183.5L184 281.5H226L296 333.5H363V264.5H184V214H281.5C281.5 214 287.291 213.302 292.5 220C296 224.5 296 230 296 230V257.5L363 214V181C363 181 363 170.826 354 160C344 147.971 327 147.5 327 147.5H258L183.5 199.5L184 147.5L116 147Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The mark plus the wordmark, for the header and anywhere the brand is shown. */
export function Logo({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {withWordmark ? (
        <span className="font-wordmark text-lg font-semibold tracking-tight">Reeg</span>
      ) : null}
    </span>
  );
}
