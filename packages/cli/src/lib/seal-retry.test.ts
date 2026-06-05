import { NoAccessError as SealNoAccessError } from '@mysten/seal';
import { describe, expect, it } from 'vitest';
import { isAccessDenied, withSealRetry } from './seal-retry';

// A class with the same NAME as Seal's but a different identity, standing in for the bundled-CLI
// case where @mysten/seal resolves to a separate module instance so instanceof would fail.
class NoAccessError extends Error {}

describe('isAccessDenied', () => {
  it('matches a real Seal NoAccessError by instanceof', () => {
    expect(isAccessDenied(new SealNoAccessError('req-id'))).toBe(true);
  });

  it('matches a same-named error from a different module instance by constructor name', () => {
    expect(isAccessDenied(new NoAccessError('denied'))).toBe(true);
  });

  it('does not match transient or unrelated errors', () => {
    expect(isAccessDenied(new Error('PTB contains an invalid parameter'))).toBe(false);
    expect(isAccessDenied(new TypeError('boom'))).toBe(false);
    expect(isAccessDenied('NoAccessError')).toBe(false); // a bare string is not an error
    expect(isAccessDenied(null)).toBe(false);
  });
});

describe('withSealRetry', () => {
  it('rethrows a denial on the first attempt, never retrying', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new NoAccessError('denied');
    };
    await expect(withSealRetry(fn, { baseDelayMs: 0 })).rejects.toBeInstanceOf(NoAccessError);
    expect(calls).toBe(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) {
        throw new Error('invalid parameter: FN has not seen the object yet');
      }
      return 'restored';
    };
    expect(await withSealRetry(fn, { baseDelayMs: 0 })).toBe('restored');
    expect(calls).toBe(3);
  });

  it('gives up after the attempt budget on a persistent transient error', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error('still lagging');
    };
    await expect(withSealRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow(
      'still lagging',
    );
    expect(calls).toBe(3);
  });
});
