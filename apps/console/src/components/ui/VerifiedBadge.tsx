import { Check, Loader2, Minus, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type VerifyState = 'verified' | 'failed' | 'checking' | 'unverified';

const COPY: Record<VerifyState, string> = {
  verified: 'Verified',
  failed: 'Not verified',
  checking: 'Checking',
  unverified: 'Not checked',
};

const SHELL: Record<VerifyState, string> = {
  verified: 'border-verified/30 bg-verified/10 text-foreground',
  failed: 'border-destructive/30 bg-destructive/10 text-foreground',
  checking: 'border-border bg-muted text-muted-foreground',
  unverified: 'border-border bg-muted text-muted-foreground',
};

/**
 * The single most important visual. A trustworthy verified checkmark, not a crypto seal: a green
 * disc with a white check on success (matching the marketing VerifiedBadge), and a calm muted
 * state otherwise. Sizes up for the environment header and down for inline rows.
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
  const md = size === 'md';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        md ? 'gap-1.5 py-1 pl-1 pr-2.5 text-sm' : 'gap-1 py-0.5 pl-0.5 pr-2 text-xs',
        SHELL[state],
        className,
      )}
      role="status"
      aria-label={COPY[state]}
    >
      <Glyph state={state} size={size} />
      {COPY[state]}
    </span>
  );
}

function Glyph({ state, size }: { state: VerifyState; size: 'sm' | 'md' }) {
  const disc = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  const icon = size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5';
  if (state === 'verified') {
    return (
      <span className={cn('grid place-items-center rounded-full bg-verified text-white', disc)}>
        <Check className={icon} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className={cn('grid place-items-center rounded-full bg-destructive text-white', disc)}>
        <X className={icon} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'checking') {
    return (
      <span className={cn('grid place-items-center', disc)}>
        <Loader2
          className={cn(icon, 'animate-spin text-muted-foreground motion-reduce:animate-none')}
          aria-hidden="true"
        />
      </span>
    );
  }
  return (
    <span className={cn('grid place-items-center text-muted-foreground', disc)}>
      <Minus className={icon} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}
