import { cn } from '../../lib/cn';

export type VerifyState = 'verified' | 'failed' | 'checking' | 'unverified';

const COPY: Record<VerifyState, string> = {
  verified: 'Verified',
  failed: 'Not verified',
  checking: 'Checking',
  unverified: 'Not checked',
};

const TONE: Record<VerifyState, string> = {
  verified: 'border-verified/30 bg-verified/10 text-verified',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  checking: 'border-border bg-muted text-muted-foreground',
  unverified: 'border-border bg-muted text-muted-foreground',
};

/**
 * The single most important visual. A trustworthy verified checkmark, not a crypto seal:
 * trust-green check on success, a calm muted state otherwise. Sizes up for the hero placement
 * on the environment header and down for inline rows.
 */
export function VerifiedBadge({
  state,
  size = 'md',
  className,
}: {
  state: VerifyState;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs',
        TONE[state],
        className,
      )}
      role="status"
      aria-label={COPY[state]}
    >
      <Glyph state={state} />
      {COPY[state]}
    </span>
  );
}

function Glyph({ state }: { state: VerifyState }) {
  const cls = 'h-3.5 w-3.5';
  if (state === 'verified') {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3 8.5l3 3 7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'checking') {
    return (
      <svg
        className={cn(cls, 'animate-spin motion-reduce:animate-none')}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}
