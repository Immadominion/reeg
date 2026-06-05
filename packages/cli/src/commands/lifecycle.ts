import { createShareableMachine, fork, retire } from '@reeg/sdk';
import type { Command } from 'commander';
import { buildClients, loadKeypair } from '../lib/clients';
import { type CommonOptions, loadConfig, requireOperator } from '../lib/config';
import { addChainOptions } from '../lib/options';
import { recordMachine } from '../lib/state';

/** `reeg create`: mint a new environment you own, with a shared access policy so it can be
 *  shared later, and remember its local working directory. */
export function registerCreate(program: Command): void {
  addChainOptions(
    program.command('create').description('Create a new environment you own.'),
  ).action(async (options: CommonOptions) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const { sui } = buildClients(config);
    const signer = loadKeypair(operator);

    const { machineId, policyId, digest } = await createShareableMachine(
      { packageId: config.packageId },
      { sui, signer },
    );
    const state = recordMachine(machineId, config.network, nowIso(), policyId);

    console.log(`Created environment ${machineId}`);
    console.log(`  policy:  ${policyId}`);
    console.log(`  workdir: ${state.workdir}`);
    console.log(`  tx:      ${digest}`);
  });
}

/** `reeg fork <machineId>`: create a child that records provable lineage to the parent. The
 *  child starts with an empty workdir; restore the parent's state into it when needed. */
export function registerFork(program: Command): void {
  addChainOptions(
    program
      .command('fork')
      .description('Fork an environment into a child that records its lineage.')
      .argument('<machineId>', 'the parent environment id'),
  ).action(async (machineId: string, options: CommonOptions) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const { sui } = buildClients(config);
    const signer = loadKeypair(operator);

    const { machineId: childId, digest } = await fork(
      { packageId: config.packageId, machineId },
      { sui, signer },
    );
    const state = recordMachine(childId, config.network, nowIso());

    console.log(`Forked ${machineId}`);
    console.log(`  child:   ${childId}`);
    console.log(`  workdir: ${state.workdir} (empty)`);
    console.log(`  tx:      ${digest}`);
  });
}

/** `reeg retire <machineId>`: append a permanent, verifiable end-of-life marker. The record stays
 *  verifiable; the operator may then let the Walrus storage window lapse. The Reeg client declines
 *  further checkpoints on a retired environment. */
export function registerRetire(program: Command): void {
  addChainOptions(
    program
      .command('retire')
      .description('Retire an environment: a permanent, verifiable end-of-life marker.')
      .argument('<machineId>', 'the environment id'),
  ).action(async (machineId: string, options: CommonOptions) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const { sui } = buildClients(config);
    const signer = loadKeypair(operator);

    const { digest } = await retire({ packageId: config.packageId, machineId }, { sui, signer });

    console.log(`Retired ${machineId}`);
    console.log(
      '  A permanent end-of-life entry is now in the provenance chain (verifiable offline).',
    );
    console.log('  The record stays on chain; you may stop paying for this run’s Walrus storage');
    console.log('  once your retention window (e.g. EU AI Act Art. 12) has elapsed.');
    console.log(`  tx: ${digest}`);
  });
}

// Wall-clock timestamp for the local state cache only; the authoritative time is the on-chain epoch.
function nowIso(): string {
  return new Date().toISOString();
}
