import { cn } from '../../lib/cn';

/** The atmospheric backdrop used behind the dashboard hero and empty states: a soft accent glow
 *  and a faint blueprint grid, masked to fade at the edges. Purely decorative. Mirrors the
 *  marketing TopGlow but scoped to a section rather than the whole page. */
export function Glow({
  className,
  tone = 'accent',
}: {
  className?: string;
  tone?: 'accent' | 'verified';
}) {
  const color = tone === 'verified' ? 'var(--verified)' : 'var(--accent)';
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div
        className="absolute left-1/2 top-[-160px] h-[460px] w-[820px] max-w-[140vw] -translate-x-1/2 rounded-full opacity-[0.14]"
        style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }}
      />
      <div className="bg-grid absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_0%,black,transparent)]" />
    </div>
  );
}
