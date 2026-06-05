import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fromHex } from '@mysten/sui/utils';
import { checkpoint, restore } from '@reeg/sdk';
import type { Command } from 'commander';
import { buildClients, loadKeypair } from '../lib/clients';
import { type CommonOptions, loadConfig, requireOperator } from '../lib/config';
import { engineCheckpoint, engineRestore, engineRun } from '../lib/engine';
import { addChainOptions } from '../lib/options';
import { isRetiredOrFalse } from '../lib/retired';
import { withSealRetry } from '../lib/seal-retry';
import { getMachine, getMachineOrNull, logFor, memoryFor } from '../lib/state';

/** `reeg run <machineId> -- <command...>`: run a command in the environment's working directory
 *  and append it to the command log. Purely local; needs no signer or chain access. Use `--`
 *  before the command so the CLI passes its flags through untouched. */
export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Run a command inside an environment (use -- before the command).')
    .argument('<machineId>', 'the environment id')
    .argument('<command...>', 'the command and arguments to run')
    .action(async (machineId: string, command: string[]) => {
      const machine = getMachine(machineId);
      const bin = process.env.REEG_ENGINE ?? 'reeg-engine';
      // Expose a memory directory to the command (REEG_MEMORY_DIR) so an agent's memory backend
      // writes there; the next checkpoint captures it into the bundle.
      const memory = memoryFor(machineId);
      mkdirSync(memory, { recursive: true });
      const result = await engineRun(bin, machine.workdir, logFor(machineId), command, memory);
      if (result.exitCode !== 0) {
        console.error(`command exited ${result.exitCode}`);
      }
      // Surface the command's own exit code so scripts see a faithful result.
      process.exitCode = result.exitCode;
    });
}

/** `reeg checkpoint <machineId>`: pack the working directory, encrypt it, store it on Walrus, and
 *  anchor the blob and manifest hash on chain in one transaction. */
export function registerCheckpoint(program: Command): void {
  addChainOptions(
    program
      .command('checkpoint')
      .description('Snapshot an environment: pack, encrypt, store on Walrus, anchor on Sui.')
      .argument('<machineId>', 'the environment id')
      .option('--epochs <n>', 'Walrus epochs to keep the snapshot paid for', '1'),
  ).action(async (machineId: string, options: CommonOptions & { epochs?: string }) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const machine = getMachine(machineId);

    const { sui, crypto, storage } = buildClients(config);
    // A retired environment is concluded: decline further checkpoints (the on-chain record stays
    // verifiable, but adding to a retired run would muddy its end-of-life marker). isRetiredOrFalse
    // fails open, so a transient RPC/indexer hiccup never blocks a legitimate checkpoint; only a
    // confirmed retirement declines.
    if (await isRetiredOrFalse(sui, config.packageId, machineId)) {
      console.error(`error: ${machineId} is retired; it cannot be checkpointed again`);
      process.exitCode = 1;
      return;
    }

    // The bundle sits beside the workdir, not inside it, so the snapshot never captures itself.
    const bundlePath = join(dirname(machine.workdir), 'checkpoint.bundle');
    // Capture the agent memory directory only when it holds something, so a memory-less run keeps
    // the same manifest shape (memory_pointer null) and the filesystem story stands on its own.
    const memory = memoryFor(machineId);
    const captureMemory = existsSync(memory) && readdirSync(memory).length > 0;
    const info = await engineCheckpoint(
      config.engineBin,
      machine.workdir,
      bundlePath,
      logFor(machineId),
      captureMemory ? memory : undefined,
    );
    const bundleBytes = readFileSync(bundlePath);

    const signer = loadKeypair(operator);
    const result = await checkpoint(
      { data: bundleBytes, manifestHash: fromHex(info.manifestHashHex) },
      {
        machineId,
        packageId: config.packageId,
        // A shareable Machine encrypts under its policy identity so grantees can decrypt.
        policyId: machine.policyId,
        threshold: config.sealThreshold,
        epochs: Number(options.epochs ?? '1'),
        payloadHash: fromHex(info.payloadHashHex),
      },
      { crypto, storage, sui, signer },
    );

    const epochs = Number(options.epochs ?? '1');
    console.log(`Snapshot saved for ${machineId}`);
    console.log(`  manifest: ${info.manifestHashHex}`);
    if (info.memoryPointer) {
      console.log(`  memory:   ${info.memoryPointer} (captured and verified with the environment)`);
    }
    console.log(`  blob:     ${result.blobId}`);
    console.log(`  bytes:    ${info.bundleBytes}`);
    console.log(`  tx:       ${result.digest}`);
    // Retention is a Walrus storage-epoch policy you set with --epochs; the on-chain provenance
    // head is permanent. Surfaced plainly so a compliance buyer sees the real window and cost.
    console.log(
      `  retention: ${epochs} Walrus epoch${epochs === 1 ? '' : 's'} (~${epochs * 2} weeks on testnet); EU AI Act Art. 12 wants >= ~6 months (~13 epochs, --epochs 13)`,
    );
    console.log('  cost: WAL for storage (scales with size x epochs) plus a little SUI gas');
    // The backup key is the only way to recover the ciphertext if Seal access is lost. Never logged.
    console.log('  (a disaster-recovery backup key was produced in memory; store it out of band)');
    void result.backupKey;
  });
}

/** `reeg restore <machineId>`: read the latest checkpoint from Walrus, decrypt it with a Seal
 *  session the caller authorizes, and unpack it into a working directory. Works for the owner and
 *  for a grantee: a grantee who never created the Machine locally passes `--dest`. */
export function registerRestore(program: Command): void {
  addChainOptions(
    program
      .command('restore')
      .description('Restore an environment from its latest checkpoint into a working directory.')
      .argument('<machineId>', 'the environment id')
      .option('--dest <dir>', 'restore into this directory instead of the machine workdir'),
  ).action(async (machineId: string, options: CommonOptions & { dest?: string }) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const machine = getMachineOrNull(machineId);
    const dest = options.dest ?? machine?.workdir;
    if (!dest) {
      console.error('error: no local workdir for this environment; pass --dest <dir>');
      process.exitCode = 1;
      return;
    }

    const { sui, crypto, storage } = buildClients(config);
    const signer = loadKeypair(operator);
    // A Seal key server's fullnode can briefly lag a just-mutated shared policy (right after a
    // grant or revoke), so a legitimate restore may transiently fail; retry those. A definitive
    // NoAccess (the policy denied this caller) is final, so fail fast on it.
    const bundle = await withSealRetry(() =>
      restore({ machineId, packageId: config.packageId }, { sui, storage, crypto, signer }),
    );

    const bundlePath = join(
      tmpdir(),
      `reeg-restore-${machineId.replace(/[^a-zA-Z0-9]/g, '')}.bundle`,
    );
    writeFileSync(bundlePath, bundle);
    // Rebuild agent memory beside the working directory (a sibling `memory` dir), matching how a
    // Machine's workdir and memory sit side by side. The engine restores it only if the bundle
    // carries a memory pointer, so a memory-less run is unaffected.
    const memoryDest = join(dirname(dest), 'memory');
    const info = await engineRestore(config.engineBin, bundlePath, dest, memoryDest);

    console.log(`Restored ${machineId} into ${dest}`);
    console.log(`  manifest: ${info.manifestHashHex}`);
    console.log(`  root:     ${info.workdirRootHashHex}`);
    if (info.memoryPointer) {
      console.log(`  memory:   ${info.memoryPointer} -> ${memoryDest}`);
    }
  });
}
