import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { verifyFromChain } from '@reeg/verify';
import type { Command } from 'commander';

type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

interface VerifyOptions {
  network: string;
  rpc?: string;
  package?: string;
}

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
    .action(async (machineId: string, options: VerifyOptions) => {
      const packageId = options.package;
      if (!packageId) {
        console.error('error: a package id is required (--package or REEG_PACKAGE_ID)');
        process.exitCode = 1;
        return;
      }
      const network = asNetwork(options.network);
      const url = options.rpc ?? getJsonRpcFullnodeUrl(network);
      const client = new SuiJsonRpcClient({ url, network });

      // Public RPCs occasionally reset a connection; verification reads are idempotent, retry.
      const report = await retry(() => verifyFromChain(client, packageId, machineId));

      console.log(report.ok ? `Verified: ${machineId}` : `NOT verified: ${machineId}`);
      for (const check of report.checks) {
        console.log(`  ${check.passed ? 'ok  ' : 'FAIL'} ${check.name} - ${check.detail}`);
      }
      process.exitCode = report.ok ? 0 : 1;
    });
}

function asNetwork(value: string): SuiNetwork {
  if (value === 'mainnet' || value === 'testnet' || value === 'devnet' || value === 'localnet') {
    return value;
  }
  throw new Error(`unknown network "${value}" (expected mainnet, testnet, devnet, or localnet)`);
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
