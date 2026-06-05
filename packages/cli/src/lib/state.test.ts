import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMachine, logFor, recordMachine, workdirFor } from './state';

describe('local machine state', () => {
  let home: string;
  let savedHome: string | undefined;

  // Point REEG_HOME at a throwaway directory so the real ~/.reeg is never touched.
  beforeEach(() => {
    savedHome = process.env.REEG_HOME;
    home = mkdtempSync(join(tmpdir(), 'reeg-state-'));
    process.env.REEG_HOME = home;
  });
  afterEach(() => {
    if (savedHome === undefined) {
      delete process.env.REEG_HOME;
    } else {
      process.env.REEG_HOME = savedHome;
    }
  });

  it('derives workdir and log paths under REEG_HOME', () => {
    expect(workdirFor('0xabc')).toBe(join(home, 'machines', '0xabc', 'work'));
    expect(logFor('0xabc')).toBe(join(home, 'machines', '0xabc', 'log.json'));
  });

  it('records a machine and reads it back', () => {
    const entry = recordMachine('0xabc', 'testnet', '2026-06-02T00:00:00.000Z');
    expect(entry.network).toBe('testnet');
    expect(entry.workdir).toBe(workdirFor('0xabc'));
    expect(getMachine('0xabc')).toEqual(entry);
  });

  it('throws for an unknown machine', () => {
    expect(() => getMachine('0xmissing')).toThrow(/unknown environment/);
  });
});
