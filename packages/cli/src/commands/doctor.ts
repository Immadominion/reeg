import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Command } from 'commander';
import { loadKeypair } from '../lib/clients';
import { type CommonOptions, resolveConfig } from '../lib/config';

const execFileAsync = promisify(execFile);

type Status = 'ok' | 'warn' | 'fail' | 'info';
interface Check {
  status: Status;
  label: string;
  detail?: string;
}

const SYMBOL: Record<Status, string> = { ok: '✓', warn: '⚠', fail: '✗', info: '·' };

/** `reeg doctor`: a read-only preflight. It checks the things that otherwise fail late with a
 *  cryptic error on a first run — keystore, engine binary, package id, RPC reachability, funds, and
 *  whether checkpoints can actually be encrypted — and prints one clear checklist with remedies. */
export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Preflight your setup: keystore, engine, funds, network, and encryption config.')
    .option('-n, --network <network>', 'sui network', process.env.REEG_NETWORK ?? 'testnet')
    .option('--rpc <url>', 'override the Sui RPC URL')
    .option('--package <id>', 'the Reeg Move package id', process.env.REEG_PACKAGE_ID)
    .option('--operator <address>', 'operator address that signs', process.env.REEG_OPERATOR)
    .action(async (options: CommonOptions) => {
      const config = resolveConfig(options);
      const checks: Check[] = [];

      checks.push({ status: 'info', label: 'Network', detail: config.network });
      checks.push({ status: 'info', label: 'RPC', detail: config.rpcUrl });

      checks.push(
        config.packageId
          ? { status: 'ok', label: 'Package id', detail: config.packageId }
          : {
              status: 'fail',
              label: 'Package id',
              detail: 'not set — pass --package or set REEG_PACKAGE_ID',
            },
      );
      // Seal rejects an upgraded package id and event types are tagged with the defining
      // (original) package, so both silently use the original id of a known Reeg upgrade
      // lineage. Surface the split so a mismatch is visible, not mysterious.
      if (config.packageId && config.originalPackageId !== config.packageId) {
        checks.push({
          status: 'info',
          label: 'Original package id',
          detail: `${config.originalPackageId} (first-published id; Seal encrypt/decrypt and event queries use it)`,
        });
      }

      checks.push(await checkEngine(config.engineBin));

      if (config.operator) {
        checks.push({ status: 'ok', label: 'Operator', detail: config.operator });
        checks.push(checkKeystore(config.operator));
      } else {
        checks.push({
          status: 'warn',
          label: 'Operator',
          detail:
            'not set — pass --operator or set REEG_OPERATOR (needed to sign create/checkpoint)',
        });
      }

      // The footgun: a checkpoint encrypts before it touches Walrus, so no key servers = no encryption.
      checks.push(
        config.sealKeyServers.length > 0
          ? {
              status: 'ok',
              label: 'Seal key servers',
              detail: `${config.sealKeyServers.length} configured (checkpoints will be encrypted)`,
            }
          : {
              status: 'fail',
              label: 'Seal key servers',
              detail: `none for ${config.network} — checkpoints cannot be encrypted; set REEG_SEAL_KEY_SERVERS`,
            },
      );

      checks.push(
        config.walrusUploadRelay
          ? { status: 'ok', label: 'Walrus upload relay', detail: config.walrusUploadRelay }
          : {
              status: 'warn',
              label: 'Walrus upload relay',
              detail: 'none — uploads go direct to nodes (slower, can fail on large blobs)',
            },
      );

      if (config.network === 'mainnet') {
        checks.push(
          process.env.SEAL_RUBY_API_KEY
            ? { status: 'ok', label: 'Mainnet Seal API key', detail: 'SEAL_RUBY_API_KEY set' }
            : {
                status: 'warn',
                label: 'Mainnet Seal API key',
                detail:
                  'SEAL_RUBY_API_KEY not set — encrypted restore (decrypt) needs a provider key server; encryption, anchoring, and verify still work',
              },
        );
      }

      const sui = new SuiJsonRpcClient({ url: config.rpcUrl, network: config.network });
      checks.push(await checkRpc(sui));
      if (config.operator) {
        checks.push(await checkFunds(sui, config.operator));
      }

      console.log(`reeg doctor — ${config.network}`);
      for (const check of checks) {
        console.log(
          `  ${SYMBOL[check.status]} ${check.label}${check.detail ? `: ${check.detail}` : ''}`,
        );
      }

      const fails = checks.filter((check) => check.status === 'fail').length;
      const warns = checks.filter((check) => check.status === 'warn').length;
      console.log('');
      if (fails > 0) {
        const w = warns ? `, ${warns} warning${warns === 1 ? '' : 's'}` : '';
        console.log(
          `${fails} blocking issue${fails === 1 ? '' : 's'}${w}. Fix the ✗ items above, then re-run \`reeg doctor\`.`,
        );
        process.exitCode = 1;
      } else if (warns > 0) {
        console.log(`Ready, with ${warns} warning${warns === 1 ? '' : 's'} (⚠) to be aware of.`);
      } else {
        console.log('Ready. All checks passed.');
      }
    });
}

async function checkEngine(bin: string): Promise<Check> {
  // A path that does not exist is the most common failure; surface it before any command needs it.
  if (bin.includes('/') && !existsSync(bin)) {
    return {
      status: 'fail',
      label: 'Engine binary',
      detail: `not found at '${bin}' — build it (cargo build --manifest-path engine/Cargo.toml) and set REEG_ENGINE`,
    };
  }
  try {
    await withTimeout(execFileAsync(bin, ['--help']), 5000);
    return { status: 'ok', label: 'Engine binary', detail: bin };
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return {
        status: 'fail',
        label: 'Engine binary',
        detail: `'${bin}' not on PATH — build it (cargo build --manifest-path engine/Cargo.toml) and set REEG_ENGINE`,
      };
    }
    // Present but returned nonzero (e.g. no --help): existence is what we needed to confirm.
    return { status: 'ok', label: 'Engine binary', detail: bin };
  }
}

function checkKeystore(operator: string): Check {
  try {
    loadKeypair(operator);
    return { status: 'ok', label: 'Signing key', detail: 'found in the Sui keystore' };
  } catch (err) {
    return { status: 'fail', label: 'Signing key', detail: (err as Error).message };
  }
}

async function checkRpc(sui: SuiJsonRpcClient): Promise<Check> {
  try {
    const id = await withTimeout(sui.getChainIdentifier(), 8000);
    return { status: 'ok', label: 'RPC reachable', detail: `chain ${id}` };
  } catch (err) {
    return {
      status: 'fail',
      label: 'RPC reachable',
      detail: `cannot reach the RPC: ${(err as Error).message}`,
    };
  }
}

async function checkFunds(sui: SuiJsonRpcClient, operator: string): Promise<Check> {
  try {
    const balance = await withTimeout(sui.getBalance({ owner: operator }), 8000);
    const sui9 = Number(balance.totalBalance) / 1e9;
    if (sui9 === 0) {
      return {
        status: 'warn',
        label: 'Operator funds',
        detail: '0 SUI — create/checkpoint need SUI for gas and WAL for storage',
      };
    }
    return {
      status: 'ok',
      label: 'Operator funds',
      detail: `${sui9.toFixed(4)} SUI (WAL is also required for storage)`,
    };
  } catch (err) {
    return {
      status: 'warn',
      label: 'Operator funds',
      detail: `could not read balance: ${(err as Error).message}`,
    };
  }
}

/** Race a promise against a timeout so an unreachable endpoint reports cleanly instead of hanging. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
