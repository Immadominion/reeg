import { useSyncExternalStore } from 'react';

// A tiny hash router. Hash routing works without server rewrites, which suits a static Walrus
// Site. Routes: "/" (home) and "/env/<id>" (environment detail).

function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.length > 0 ? hash : '/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The current route path, reactive to hash changes. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function navigate(to: string): void {
  window.location.hash = to;
}

/** Returns the environment id if the path is an environment detail route, else null. */
export function matchEnvironment(path: string): string | null {
  const match = /^\/env\/(0x[0-9a-fA-F]+)$/.exec(path);
  return match ? (match[1] as string) : null;
}
