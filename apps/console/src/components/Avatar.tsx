import { cn } from '../lib/cn';

// A person is shown by avatar, not an address (design brief). Until a name service is wired, we
// derive a stable color and initials from the address so an owner reads as a consistent person.
const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#db2777', '#ea580c', '#0891b2'];

export function Avatar({ id, className }: { id: string; className?: string }) {
  const clean = id.startsWith('0x') ? id.slice(2) : id;
  let sum = 0;
  for (let i = 0; i < clean.length; i++) {
    sum += clean.charCodeAt(i);
  }
  const color = COLORS[sum % COLORS.length];
  const initials = clean.slice(0, 2).toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
