import { cn } from '@/lib/cn';

/** The Reeg mark only (square glyph, public/transparent-bg-logo.svg) as currentColor. */
function LogoMark({ className }: { className?: string }) {
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

/** The Reeg lockup (mark + wordmark) from public/reeg-text.svg, tinted with currentColor via a CSS
 *  mask so the single SVG is the source of truth and the lockup adapts to light and dark bands. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  if (!showWordmark) {
    return <LogoMark className={className} />;
  }
  return (
    <span
      role="img"
      aria-label="Reeg"
      className={cn('inline-block h-6 w-[81px] bg-current text-foreground', className)}
      style={{
        maskImage: 'url(/reeg-text.svg)',
        WebkitMaskImage: 'url(/reeg-text.svg)',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskPosition: 'left center',
        WebkitMaskPosition: 'left center',
      }}
    />
  );
}
