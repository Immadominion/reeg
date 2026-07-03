import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { verifyFromChain } from '@reeg/verify';
import type { Command } from 'commander';
import { type CommonOptions, resolveConfig } from '../lib/config';

/** Register `reeg verify <machineId>`: confirm a Machine's provenance from public Sui data,
 *  with the Reeg backend offline. Exits non-zero if any check fails. */
export function registerVerify(program: Command): void {
  program
    .command('verify')
    .description('Verify a Machine from public Sui data, with the Reeg backend offline.')
    .argument('<machineId>', 'the Machine object id (0x...)')
    .option('-n, --network <network>', 'sui network', process.env.REEG_NETWORK ?? 'testnet')
    .option('--rpc <url>', 'override the Sui RPC URL')
    .option('--package <id>', 'the Reeg Move package id', process.env.REEG_PACKAGE_ID)
    .action(async (machineId: string, options: CommonOptions) => {
      const config = resolveConfig(options);
      if (!config.packageId) {
        console.error('error: a package id is required (--package or REEG_PACKAGE_ID)');
        process.exitCode = 1;
        return;
      }
      const client = new SuiJsonRpcClient({ url: config.rpcUrl, network: config.network });

      // Events are tagged with the DEFINING (original) package id; querying with an upgraded id
      // would silently find no checkpoints and fail an honest run. Public RPCs occasionally reset
      // a connection; verification reads are idempotent, retry.
      const report = await retry(() =>
        verifyFromChain(client, config.originalPackageId, machineId),
      );

      console.log(report.ok ? `Verified: ${machineId}` : `NOT verified: ${machineId}`);
      for (const check of report.checks) {
        console.log(`  ${check.passed ? 'ok  ' : 'FAIL'} ${check.name} - ${check.detail}`);
      }
      process.exitCode = report.ok ? 0 : 1;
    });
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw lastError;
}
