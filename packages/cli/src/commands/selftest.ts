import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromHex, toHex } from '@mysten/sui/utils';
import { readMachine } from '@reeg/chain';
import { checkpoint, createShareableMachine, restore, retire } from '@reeg/sdk';
import { verifyFromChain } from '@reeg/verify';
import type { Command } from 'commander';
import { buildClients, loadKeypair } from '../lib/clients';
import {
  type CommonOptions,
  loadConfig,
  requireEncryptionConfig,
  requireOperator,
} from '../lib/config';
import { engineCheckpoint, engineRestore } from '../lib/engine';
import { addChainOptions } from '../lib/options';
import { isRetiredOrFalse } from '../lib/retired';
import { withSealRetry } from '../lib/seal-retry';

interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

/** `reeg selftest`: prove the whole loop works from THIS machine with THIS config, end to end,
 *  against the real network: create -> checkpoint (pack, encrypt, Walrus, anchor) -> restore
 *  byte-identically -> verify offline -> retire. A tiny throwaway environment (a few hundred
 *  bytes, including an agent-memory file) keeps cost near zero. It exercises the exact same code
 *  paths the real commands use, so a green selftest means the product works here, not that a
 *  separate test harness does. Exits non-zero naming the first failing step. */
export function registerSelftest(program: Command): void {
  addChainOptions(
    program
      .command('selftest')
      .description(
        'Prove the full loop works from this machine: create, checkpoint, restore, verify, retire.',
      )
      .option('--epochs <n>', 'Walrus epochs to keep the throwaway snapshot paid for', '1')
      .option('--keep', 'keep the throwaway environment instead of retiring it'),
  ).action(async (options: CommonOptions & { epochs?: string; keep?: boolean }) => {
    const steps: StepResult[] = [];
    const scratch = mkdtempSync(join(tmpdir(), 'reeg-selftest-'));
    let machineId = '';

    const run = async (
      name: string,
      timeoutMs: number,
      fn: () => Promise<string>,
    ): Promise<boolean> => {
      const started = Date.now();
      process.stdout.write(`  ${name} ... `);
      try {
        const detail = await withTimeout(fn(), timeoutMs, name);
        steps.push({ name, ok: true, ms: Date.now() - started, detail });
        console.log(`ok (${fmtMs(Date.now() - started)})${detail ? ` ${detail}` : ''}`);
        return true;
      } catch (err) {
        const detail = (err as Error).message;
        steps.push({ name, ok: false, ms: Date.now() - started, detail });
        console.log(`FAILED (${fmtMs(Date.now() - started)})`);
        console.error(`    ${detail}`);
        return false;
      }
    };

    try {
      // -- preflight: resolve config and the signing key up front so failures are immediate and
      // named, not buried inside a later network call.
      const config = loadConfig(options);
      const operator = requireOperator(config);
      requireEncryptionConfig(config);
      const signer = loadKeypair(operator);
      const clients = buildClients(config);
      const { sui } = clients;

      console.log(`reeg selftest — ${config.network} (operator ${operator})`);
      console.log(
        `  package ${config.packageId}${config.originalPackageId !== config.packageId ? ` (Seal uses ${config.originalPackageId})` : ''}`,
      );
      console.log('  cost: a little SUI gas + a tiny WAL storage fee\n');

      // -- the throwaway environment: a workdir with two small files and an agent-memory file, so
      // the loop also proves memory capture (memory_pointer) end to end.
      const workdir = join(scratch, 'work');
      const memory = join(scratch, 'memory');
      const restored = join(scratch, 'restored');
      const restoredMemory = join(scratch, 'restored-memory');
      mkdirSync(join(workdir, 'src'), { recursive: true });
      mkdirSync(memory, { recursive: true });
      writeFileSync(join(workdir, 'notes.md'), 'reeg selftest: portable environment\n');
      writeFileSync(join(workdir, 'src', 'data.txt'), 'a\nb\nc\n');
      writeFileSync(join(memory, 'memory.json'), '{"fact":"selftest memory survives restore"}\n');
      const logPath = join(scratch, 'log.json');

      let policyId = '';
      const created = await run('create environment', 90_000, async () => {
        const res = await createShareableMachine({ packageId: config.packageId }, { sui, signer });
        machineId = res.machineId;
        policyId = res.policyId;
        await sui.waitForTransaction({ digest: res.digest });
        return machineId;
      });
      if (!created) {
        return finish(steps, machineId);
      }

      let manifestHex = '';
      const checkpointed = await run(
        'checkpoint (pack, encrypt, Walrus, anchor)',
        300_000,
        async () => {
          const bundlePath = join(scratch, 'checkpoint.bundle');
          const info = await engineCheckpoint(
            config.engineBin,
            workdir,
            bundlePath,
            logPath,
            memory,
          );
          manifestHex = info.manifestHashHex;
          if (!info.memoryPointer) {
            throw new Error('the engine did not capture the memory directory (no memory_pointer)');
          }
          const result = await checkpoint(
            { data: readFileSync(bundlePath), manifestHash: fromHex(info.manifestHashHex) },
            {
              machineId,
              packageId: config.packageId,
              sealPackageId: config.originalPackageId,
              policyId,
              threshold: config.sealThreshold,
              epochs: Number(options.epochs ?? '1'),
              payloadHash: fromHex(info.payloadHashHex),
            },
            { ...clients, signer },
          );
          await sui.waitForTransaction({ digest: result.digest });
          const machine = await readMachine(sui, machineId);
          if (machine.checkpointCount !== 1n) {
            throw new Error(`expected checkpoint count 1, chain says ${machine.checkpointCount}`);
          }
          if (toHex(machine.manifestHash) !== manifestHex) {
            throw new Error('the anchored manifest hash does not match what the engine computed');
          }
          return `blob ${result.blobId}`;
        },
      );
      if (!checkpointed) {
        return finish(steps, machineId);
      }

      const restoredOk = await run('restore (Walrus, decrypt, unpack)', 240_000, async () => {
        const bundle = await withSealRetry(() =>
          restore(
            { machineId, packageId: config.packageId, sealPackageId: config.originalPackageId },
            { ...clients, signer },
          ),
        );
        const bundlePath = join(scratch, 'restore.bundle');
        writeFileSync(bundlePath, bundle, { mode: 0o600, flag: 'wx' });
        const info = await engineRestore(config.engineBin, bundlePath, restored, restoredMemory);
        if (info.manifestHashHex !== manifestHex) {
          throw new Error('restored manifest hash does not match the checkpoint');
        }
        for (const rel of ['notes.md', 'src/data.txt']) {
          const a = readFileSync(join(workdir, rel));
          const b = readFileSync(join(restored, rel));
          if (!a.equals(b)) {
            throw new Error(`restored ${rel} is not byte-identical`);
          }
        }
        const mem = readFileSync(join(restoredMemory, 'memory.json'), 'utf8');
        if (!mem.includes('selftest memory survives restore')) {
          throw new Error('the agent-memory file did not survive the restore');
        }
        return 'byte-identical, memory included';
      });
      if (!restoredOk) {
        return finish(steps, machineId);
      }

      const verified = await run('verify offline (public Sui data only)', 120_000, async () => {
        const report = await withSealRetry(
          () => verifyFromChain(sui, config.originalPackageId, machineId),
          { attempts: 3, baseDelayMs: 1500 },
        );
        if (!report.ok) {
          const failed = report.checks.filter((c) => !c.passed);
          throw new Error(
            `verification failed: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}`,
          );
        }
        return `${report.checks.length} checks passed`;
      });
      if (!verified) {
        return finish(steps, machineId);
      }

      if (!options.keep) {
        await run('retire (permanent end-of-life marker)', 90_000, async () => {
          const { digest } = await retire(
            { packageId: config.packageId, machineId },
            { sui, signer },
          );
          await sui.waitForTransaction({ digest });
          // The fullnode can lag indexing the MachineRetired event by a moment; poll briefly
          // before concluding the retirement did not land.
          for (let attempt = 1; attempt <= 5; attempt++) {
            if (await isRetiredOrFalse(sui, config.originalPackageId, machineId)) {
              return 'confirmed on chain';
            }
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
          }
          throw new Error('the chain does not report the environment as retired');
        });
      }

      finish(steps, machineId);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
}

function finish(steps: StepResult[], machineId: string): void {
  const failed = steps.filter((s) => s.ok === false);
  const total = steps.reduce((ms, s) => ms + s.ms, 0);
  console.log('');
  if (failed.length === 0) {
    console.log(`Selftest PASSED: the full loop works from this machine (${fmtMs(total)}).`);
    if (machineId) {
      console.log(`  throwaway environment: ${machineId}`);
    }
  } else {
    console.log(`Selftest FAILED at "${failed[0]?.name}" (${fmtMs(total)}).`);
    console.log('  Run `reeg doctor` to check your setup; REEG_DEBUG=1 keeps full stack traces.');
    process.exitCode = 1;
  }
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Race a promise against a per-step timeout so a stalled upload or RPC hangs the step, not the
 *  whole selftest, and the failure names the step that stalled. */
async function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`"${step}" timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
