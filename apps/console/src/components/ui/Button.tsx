import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'border border-border bg-background text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  destructive:
    'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-5 text-[15px]',
};

const BASE = cn(
  'inline-flex select-none items-center justify-center rounded-lg font-medium',
  'transition-[transform,opacity,background-color,border-color] duration-100 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...props} />;
}

interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  size?: Size;
}

/** An anchor styled as a button, for navigation and external links. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  target,
  rel,
  ...props
}: ButtonLinkProps) {
  const external = target === '_blank';
  return (
    <a
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      target={target}
      rel={rel ?? (external ? 'noreferrer noopener' : undefined)}
      {...props}
    />
  );
}
