import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

// The single most important visual (brand.md). It must read like a trustworthy verified checkmark,
// not a crypto seal: a filled verified-green check and a plain "Verified" label. The label sits in
// the foreground color (not green) so it always clears WCAG AA; the green carries the meaning.
export function VerifiedBadge({
  label = 'Verified',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-verified/30 bg-verified/10 py-1 pl-1 pr-2.5 text-xs font-semibold text-foreground',
        className,
      )}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full bg-verified text-white">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </span>
      {label}
    </span>
  );
}
