import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class names, resolving Tailwind conflicts (later wins). Mirrors the Console helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
