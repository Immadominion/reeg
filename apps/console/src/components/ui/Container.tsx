import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** The shared page gutter. One max width and one responsive padding for every screen, so the
 *  dashboard keeps a single rhythm. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 sm:px-6', className)} {...props} />;
}
