import { describe, expect, it } from 'vitest';
import { forkAvailability, forkErrorMessage } from './fork';

const OWNER = `0x${'1'.repeat(64)}`;
const OTHER = `0x${'2'.repeat(64)}`;

describe('forkAvailability', () => {
  it('blocks forking when no wallet is connected', () => {
    const { canFork, hint } = forkAvailability(undefined, OWNER, 2n);
    expect(canFork).toBe(false);
    expect(hint).toMatch(/connect the owner wallet/i);
  });

  it('blocks forking for a non-owner', () => {
    const { canFork, hint } = forkAvailability(OTHER, OWNER, 2n);
    expect(canFork).toBe(false);
    expect(hint).toMatch(/only the owner/i);
  });

  it('blocks forking when there is no snapshot to branch from', () => {
    const { canFork, hint } = forkAvailability(OWNER, OWNER, 0n);
    expect(canFork).toBe(false);
    expect(hint).toMatch(/take a snapshot/i);
  });

  it('allows the owner to fork once a snapshot exists', () => {
    const { canFork, hint } = forkAvailability(OWNER, OWNER, 1n);
    expect(canFork).toBe(true);
    expect(hint).toMatch(/provable lineage/i);
  });

  it('treats the address hex case-insensitively for ownership', () => {
    const lower = `0x${'a'.repeat(64)}`;
    const upperHex = `0x${'A'.repeat(64)}`;
    expect(forkAvailability(upperHex, lower, 1n).canFork).toBe(true);
  });
});

describe('forkErrorMessage', () => {
  it('reports a wallet rejection calmly', () => {
    expect(forkErrorMessage(new Error('User rejected the request'))).toBe('Fork cancelled.');
  });

  it('reports other failures as a retryable message', () => {
    expect(forkErrorMessage(new Error('network down'))).toMatch(/could not fork/i);
  });
});
