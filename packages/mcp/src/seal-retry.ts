import { NoAccessError } from '@mysten/seal';

/**
 * A Seal NoAccessError is the key server's definitive "the policy denied this caller" verdict (a
 * non-grantee, or a revoked or expired grant). Match it by class, never by err.name/.message: a
 * bundled server and the SealClient can end up with separate @mysten/seal copies, so the
 * constructor name is the reliable cross-bundle signal.
 */
export function isAccessDenied(err: unknown): boolean {
  if (err instanceof NoAccessError) {
    return true;
  }
  return (err as { constructor?: { name?: string } })?.constructor?.name === 'NoAccessError';
}

/**
 * Retry transient decryption failures, but never a definitive access denial. The notable transient
 * is a key server's fullnode briefly lagging a just-mutated shared policy (right after a grant or
 * revoke); retrying lets it catch up. A NoAccessError is final, so it is rethrown immediately.
 */
export async function withSealRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isAccessDenied(err)) {
        throw err;
      }
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
}
