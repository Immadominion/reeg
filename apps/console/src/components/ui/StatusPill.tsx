import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'accent' | 'warning';

/** A small, quiet status pill (Running, Idle, Shared). Verification has its own VerifiedBadge. */
export function StatusPill({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-muted text-muted-foreground',
    accent: 'bg-accent/10 text-accent',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
