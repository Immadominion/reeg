import { cn } from '../../lib/cn';

/** A loading placeholder. The Console reads progressively, so screens show skeletons rather
 *  than a spinner on a blank page (design brief). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
    />
  );
}
