import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

// Mirrors the Console's Button (apps/console/src/components/ui/Button.tsx) so the two surfaces feel
// like one product, with a marketing 'lg' size and a press/active feedback added for polish.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'border border-border bg-background text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-[15px]',
};

const base = cn(
  'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium',
  'transition-[transform,opacity,background-color,border-color] duration-100 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
);

type Shared = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: Shared & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(base, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  href,
  ...props
}: Shared & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = typeof href === 'string' && href.startsWith('http');
  return (
    <a
      href={href}
      className={cn(base, VARIANTS[variant], SIZES[size], className)}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...props}
    />
  );
}
