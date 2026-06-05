import { readFileSync, writeFileSync } from 'node:fs';
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { anchorEvidence, type Evidence, exportEvidence, verifyEvidence } from '@reeg/verify';
import type { Command } from 'commander';
import { asNetwork, type CommonOptions, loadConfig } from '../lib/config';

/** `reeg evidence <machineId>`: export a portable evidence file an auditor can keep and verify
 *  offline. Read-only; no signer. Reuses the same provenance the verifier checks, adding no new
 *  trusted party (the authority stays the on-chain head, re-anchorable with `reeg audit --anchor`). */
export function registerEvidence(program: Command): void {
  program
    .command('evidence')
    .description('Export a portable evidence file an auditor can verify offline.')
    .argument('<machineId>', 'the environment id')
    .option('-n, --network <network>', 'sui network', process.env.REEG_NETWORK ?? 'testnet')
    .option('--rpc <url>', 'override the Sui RPC URL')
    .option('--package <id>', 'the Reeg Move package id', process.env.REEG_PACKAGE_ID)
    .option('--out <file>', 'write the evidence JSON here (defaults to ./evidence-<id>.json)')
    .action(async (machineId: string, options: CommonOptions & { out?: string }) => {
      const config = loadConfig(options);
      const client = new SuiJsonRpcClient({ url: config.rpcUrl, network: config.network });

      const evidence = await retry(() =>
        exportEvidence(client, config.packageId, machineId, {
          network: config.network,
          exportedAtMs: Date.now(),
        }),
      );
      const out = options.out ?? `evidence-${machineId.replace(/^0x/, '').slice(0, 12)}.json`;
      writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);

      const checkpoints = evidence.entries.filter((e) => e.eventType === 0).length;
      console.log(`Evidence written to ${out}`);
      console.log(`  machine:     ${machineId}`);
      console.log(`  checkpoints: ${checkpoints}`);
      console.log(`  head:        ${evidence.machine.provenanceHead}`);
      console.log('An auditor verifies it offline (no Reeg, no Console) with:');
      console.log(`  reeg audit ${out}            # internal consistency`);
      console.log(`  reeg audit ${out} --anchor   # also confirm it against live Sui`);
    });
}

/** `reeg audit <file>`: verify an exported evidence file. Offline by default (reads only the
 *  file); `--anchor` additionally confirms it against the live on-chain Machine. */
export function registerAudit(program: Command): void {
  program
    .command('audit')
    .description('Verify an exported evidence file. Offline by default; --anchor checks live Sui.')
    .argument('<file>', 'the evidence JSON file')
    .option('--anchor', 'also confirm the evidence matches the live on-chain Machine')
    .option('-n, --network <network>', 'sui network for --anchor (defaults to the file)')
    .option('--rpc <url>', 'override the Sui RPC URL for --anchor')
    .option('--package <id>', 'package id to anchor against, if you do not trust the file')
    .action(
      async (
        file: string,
        options: { anchor?: boolean; network?: string; rpc?: string; package?: string },
      ) => {
        const evidence = JSON.parse(readFileSync(file, 'utf8')) as Evidence;

        // Offline: the file replays to its own recorded head. This proves internal consistency,
        // not authenticity; only --anchor confirms the file is the real on-chain record.
        const report = verifyEvidence(evidence);
        for (const check of report.checks) {
          console.log(`  ${check.passed ? 'ok  ' : 'FAIL'} ${check.name} - ${check.detail}`);
        }

        if (!options.anchor) {
          console.log(
            report.ok
              ? `Internally consistent (NOT anchored to chain): ${evidence.machine.id}`
              : `NOT consistent: ${evidence.machine.id}`,
          );
          console.log('  run again with --anchor to confirm this file is the real on-chain record');
          process.exitCode = report.ok ? 0 : 1;
          return;
        }

        const network = asNetwork(options.network ?? evidence.network);
        const url = options.rpc ?? getJsonRpcFullnodeUrl(network);
        const client = new SuiJsonRpcClient({ url, network });
        const anchors = await retry(() =>
          anchorEvidence(client, evidence, { packageId: options.package }),
        );
        console.log('  anchored to live Sui:');
        for (const check of anchors) {
          console.log(`  ${check.passed ? 'ok  ' : 'FAIL'} ${check.name} - ${check.detail}`);
        }
        const ok = report.ok && anchors.every((c) => c.passed);
        console.log(
          ok
            ? `Verified (anchored): ${evidence.machine.id}`
            : `NOT verified: ${evidence.machine.id}`,
        );
        process.exitCode = ok ? 0 : 1;
      },
    );
}

// Public testnet RPCs occasionally reset a connection; the reads here are idempotent, so retry.
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
