import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { fromHex } from '@mysten/sui/utils';
import {
  checkpoint,
  createShareableMachine,
  fork,
  grant,
  originalPackageId,
  RIGHTS_RESTORE,
  RIGHTS_VIEW,
  readMachine,
  restore,
  retire,
  revoke,
} from '@reeg/sdk';
import {
  anchorEvidence,
  type Evidence,
  exportEvidence,
  verifyEvidence,
  verifyFromChain,
} from '@reeg/verify';
import { z } from 'zod';
import { buildClients, loadKeypair, suiClient } from './clients';
import { requireOperator, requirePackage, resolveConfig } from './config';
import { engineCheckpoint, engineRestore, engineRun } from './engine';
import { jsonText, retry } from './json';
import { isRetiredOrFalse } from './retired';
import { isAccessDenied, withSealRetry } from './seal-retry';
import {
  getMachine,
  getMachineOrNull,
  listMachines,
  logFor,
  memoryFor,
  recordMachine,
} from './state';

// Per-call overrides every chain-touching tool accepts, layered over the server's env config.
const overrides = {
  network: z
    .enum(['mainnet', 'testnet', 'devnet', 'localnet'])
    .optional()
    .describe('override the configured Sui network'),
  rpc: z.string().optional().describe('override the Sui RPC URL'),
  package: z.string().optional().describe('override the Reeg Move package id'),
  operator: z
    .string()
    .optional()
    .describe('override the signing address (its key must be in the local sui keystore)'),
};

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: jsonText(value) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `error: ${message}` }], isError: true };
}

function humanMessage(err: unknown): string {
  if (isAccessDenied(err)) {
    return 'access denied: you are not permitted to decrypt this environment (not a grantee, or access was revoked or has expired).';
  }
  return (err as { message?: string })?.message ?? String(err);
}

// Every tool body runs through this: a thrown error becomes one clean MCP error result instead of
// crashing the stdio transport. REEG_DEBUG=1 keeps the full stack on stderr.
async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.REEG_DEBUG === '1') {
      console.error(err);
    }
    return fail(humanMessage(err));
  }
}

/**
 * Build the Reeg MCP server: every Reeg verb exposed as a tool an agent can call. Read/verify tools
 * (reeg_verify, reeg_get, reeg_evidence, reeg_audit, reeg_list) need no signer and read only public
 * Sui + Walrus data — they work today with zero new infrastructure. Write tools sign with the
 * operator's local-keystore key today; the sponsored/delegated signer of agent-access.md slots in
 * behind the same surface later. Checkpoint/restore additionally shell to the reeg-engine binary.
 */
export function buildServer(): McpServer {
  const server = new McpServer({ name: '@reeg/mcp', version: '0.0.0' });

  // ── Read / verify (no signer; offline-from-Reeg) ─────────────────────────────────────────────

  server.registerTool(
    'reeg_verify',
    {
      title: 'Verify an environment',
      description:
        "Verify a Machine's provenance from public Sui data, with the Reeg backend offline and no decryption. Returns ok plus each individual check. Needs a package id; needs no signer.",
      inputSchema: {
        machineId: z.string().describe('the Machine object id (0x...)'),
        ...overrides,
      },
    },
    async ({ machineId, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const sui = suiClient(config);
        // Events are tagged with the DEFINING (original) package id; an upgraded id finds nothing.
        const report = await retry(() => verifyFromChain(sui, originalPackageId(pkg), machineId));
        return ok({ machineId, network: config.network, ok: report.ok, checks: report.checks });
      }),
  );

  server.registerTool(
    'reeg_get',
    {
      title: 'Read an environment',
      description:
        'Read a Machine object from chain: owner, checkpoint count, provenance head, current blob, parent (lineage), and policy id. Needs no signer.',
      inputSchema: {
        machineId: z.string().describe('the Machine object id (0x...)'),
        ...overrides,
      },
    },
    async ({ machineId, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const sui = suiClient(config);
        const machine = await retry(() => readMachine(sui, machineId));
        return ok({ machine });
      }),
  );

  server.registerTool(
    'reeg_evidence',
    {
      title: 'Export portable evidence',
      description:
        'Export a portable evidence file for a Machine that an auditor can verify offline (reeg_audit), reproducing the provenance the verifier checks without adding any trusted party. Needs a package id; needs no signer.',
      inputSchema: {
        machineId: z.string().describe('the Machine object id (0x...)'),
        out: z.string().optional().describe('also write the evidence JSON to this file path'),
        ...overrides,
      },
    },
    async ({ machineId, out, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const sui = suiClient(config);
        const evidence = await retry(() =>
          exportEvidence(sui, pkg, machineId, {
            network: config.network,
            exportedAtMs: Date.now(),
          }),
        );
        if (out) {
          writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
        }
        const checkpoints = evidence.entries.filter((e) => e.eventType === 0).length;
        return ok({
          machineId,
          network: config.network,
          head: evidence.machine.provenanceHead,
          checkpoints,
          writtenTo: out ?? null,
          evidence,
        });
      }),
  );

  server.registerTool(
    'reeg_audit',
    {
      title: 'Audit an evidence file',
      description:
        'Verify an exported evidence file. Offline by default (internal consistency only); set anchor=true to also confirm it matches the live on-chain Machine. Needs no signer.',
      inputSchema: {
        file: z.string().optional().describe('path to the evidence JSON file'),
        evidence: z
          .string()
          .optional()
          .describe('the evidence JSON as a string (alternative to file)'),
        anchor: z
          .boolean()
          .optional()
          .describe('also confirm the evidence matches the live on-chain Machine'),
        ...overrides,
      },
    },
    async ({ file, evidence, anchor, ...rest }) =>
      guard(async () => {
        let ev: Evidence;
        if (file) {
          ev = JSON.parse(readFileSync(file, 'utf8')) as Evidence;
        } else if (evidence) {
          ev = JSON.parse(evidence) as Evidence;
        } else {
          throw new Error('provide either "file" or "evidence"');
        }
        const report = verifyEvidence(ev);
        let anchors: Awaited<ReturnType<typeof anchorEvidence>> | null = null;
        if (anchor) {
          const config = resolveConfig({ ...rest, network: rest.network ?? ev.network });
          const sui = suiClient(config);
          anchors = await retry(() => anchorEvidence(sui, ev, { packageId: rest.package }));
        }
        const anchored = anchors ? anchors.every((c) => c.passed) : null;
        return ok({
          machineId: ev.machine.id,
          ok: report.ok && (anchored ?? true),
          consistent: report.ok,
          anchored,
          checks: report.checks,
          anchors,
        });
      }),
  );

  server.registerTool(
    'reeg_list',
    {
      title: 'List local environments',
      description:
        'List the environments this operator has created or restored locally (from the shared reeg state cache). The authoritative record is always on chain.',
      inputSchema: {},
    },
    async () => guard(async () => ok({ machines: listMachines() })),
  );

  // ── Local engine (no signer) ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'reeg_run',
    {
      title: 'Run a command in an environment',
      description:
        "Run a command inside an environment's working directory and append it to the command log. Purely local; needs no signer or chain access. A REEG_MEMORY_DIR is exposed so an agent's memory backend writes there and the next checkpoint captures it.",
      inputSchema: {
        machineId: z.string().describe('the environment id'),
        command: z
          .array(z.string())
          .min(1)
          .describe('the command and its arguments, e.g. ["python","train.py"]'),
      },
    },
    async ({ machineId, command }) =>
      guard(async () => {
        const config = resolveConfig({});
        const machine = getMachine(machineId);
        const memory = memoryFor(machineId);
        mkdirSync(memory, { recursive: true });
        const result = await engineRun(
          config.engineBin,
          machine.workdir,
          logFor(machineId),
          command,
          memory,
        );
        return ok({ machineId, exitCode: result.exitCode, seq: result.seq });
      }),
  );

  // ── Lifecycle / sharing (sign with the operator key) ─────────────────────────────────────────

  server.registerTool(
    'reeg_create',
    {
      title: 'Create an environment',
      description:
        'Create a new environment you own, with a shared access policy so it can be shared later. Records its local working directory. Signs with the operator key.',
      inputSchema: { ...overrides },
    },
    async (rest) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const sui = suiClient(config);
        const signer = loadKeypair(operator);
        const { machineId, policyId, digest } = await createShareableMachine(
          { packageId: pkg },
          { sui, signer },
        );
        const state = recordMachine(machineId, config.network, new Date().toISOString(), policyId);
        return ok({ machineId, policyId, digest, workdir: state.workdir });
      }),
  );

  server.registerTool(
    'reeg_fork',
    {
      title: 'Fork an environment',
      description:
        'Fork an environment into a child that records provable lineage to the parent. The child starts with an empty workdir; restore the parent state into it when needed. Signs with the operator key.',
      inputSchema: { machineId: z.string().describe('the parent environment id'), ...overrides },
    },
    async ({ machineId, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const sui = suiClient(config);
        const signer = loadKeypair(operator);
        const { machineId: childId, digest } = await fork(
          { packageId: pkg, machineId },
          { sui, signer },
        );
        const state = recordMachine(childId, config.network, new Date().toISOString());
        return ok({ parent: machineId, child: childId, digest, workdir: state.workdir });
      }),
  );

  server.registerTool(
    'reeg_retire',
    {
      title: 'Retire an environment',
      description:
        'Retire an environment: append a permanent, verifiable end-of-life marker to its provenance chain. The record stays verifiable; further checkpoints are declined. Signs with the operator key.',
      inputSchema: { machineId: z.string().describe('the environment id'), ...overrides },
    },
    async ({ machineId, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const sui = suiClient(config);
        const signer = loadKeypair(operator);
        const { digest } = await retire({ packageId: pkg, machineId }, { sui, signer });
        return ok({
          machineId,
          retired: true,
          digest,
          note: 'A permanent end-of-life entry is now in the provenance chain (verifiable offline). You may stop paying for this run’s Walrus storage once your retention window has elapsed.',
        });
      }),
  );

  server.registerTool(
    'reeg_share',
    {
      title: 'Share an environment',
      description:
        'Grant another address access to decrypt and restore this environment. role=viewer or restore (default restore); expiryMs is an optional time limit. Owner only (enforced on chain). Signs with the operator key.',
      inputSchema: {
        machineId: z.string().describe('the environment id'),
        grantee: z.string().describe('the address to grant (0x...)'),
        role: z.enum(['viewer', 'restore']).default('restore').describe('viewer or restore'),
        expiryMs: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('expiry as ms since the unix epoch; omit or 0 means no expiry'),
        ...overrides,
      },
    },
    async ({ machineId, grantee, role, expiryMs, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const sui = suiClient(config);
        const signer = loadKeypair(operator);
        const machine = await retry(() => readMachine(sui, machineId));
        const rights = role === 'viewer' ? RIGHTS_VIEW : RIGHTS_VIEW | RIGHTS_RESTORE;
        const { digest } = await grant(
          {
            packageId: pkg,
            machineId,
            policyId: machine.policyId,
            grantee,
            rights,
            expiryMs: BigInt(expiryMs ?? 0),
          },
          { sui, signer },
        );
        return ok({ machineId, grantee, role, expiryMs: expiryMs ?? 0, digest });
      }),
  );

  server.registerTool(
    'reeg_revoke',
    {
      title: 'Revoke access',
      description:
        "Revoke an address's access to an environment. Forward-looking: it stops future key fetches but cannot recall a key share already fetched. Owner only. Signs with the operator key.",
      inputSchema: {
        machineId: z.string().describe('the environment id'),
        grantee: z.string().describe('the address to revoke (0x...)'),
        ...overrides,
      },
    },
    async ({ machineId, grantee, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const sui = suiClient(config);
        const signer = loadKeypair(operator);
        const machine = await retry(() => readMachine(sui, machineId));
        const { digest } = await revoke(
          { packageId: pkg, machineId, policyId: machine.policyId, grantee },
          { sui, signer },
        );
        return ok({
          machineId,
          grantee,
          revoked: true,
          digest,
          note: 'Stops new key fetches. Anyone who already opened this environment may keep access to its data, including future snapshots.',
        });
      }),
  );

  // ── Snapshot / restore (engine + signer) ─────────────────────────────────────────────────────

  server.registerTool(
    'reeg_checkpoint',
    {
      title: 'Snapshot an environment',
      description:
        'Snapshot an environment: pack the working directory with the engine, encrypt it client-side, store the ciphertext on Walrus, and anchor the blob and manifest hash on chain in one transaction. Needs the reeg-engine binary and signs with the operator key.',
      inputSchema: {
        machineId: z.string().describe('the environment id'),
        epochs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Walrus epochs to keep the snapshot paid for (default 1; ~2 weeks each on testnet)',
          ),
        threshold: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Seal committee threshold (t-of-n key servers); defaults to the configured threshold',
          ),
        ...overrides,
      },
    },
    async ({ machineId, epochs: epochsArg, threshold: thresholdArg, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const machine = getMachine(machineId);

        const threshold = thresholdArg ?? config.sealThreshold;
        const n = config.sealKeyServers.length;
        if (!Number.isInteger(threshold) || threshold < 1 || (n > 0 && threshold > n)) {
          throw new Error(
            `threshold must be an integer in 1..${n || 1} (configured key servers: ${n})`,
          );
        }
        const epochs = epochsArg ?? 1;

        const { sui, crypto, storage } = buildClients(config);
        if (await isRetiredOrFalse(sui, originalPackageId(pkg), machineId)) {
          throw new Error(`${machineId} is retired; it cannot be checkpointed again`);
        }

        // The engine bundle is PLAINTEXT. Stage it in a fresh owner-only temp dir (mkdtemp is mode
        // 0700) and delete it as soon as it is encrypted; it never lives inside the workdir.
        const bundleDir = mkdtempSync(join(tmpdir(), 'reeg-checkpoint-'));
        try {
          const bundlePath = join(bundleDir, 'checkpoint.bundle');
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
              packageId: pkg,
              // Seal rejects an upgraded package id; encrypt under the first-published id.
              sealPackageId: originalPackageId(pkg),
              policyId: machine.policyId,
              threshold,
              epochs,
              payloadHash: fromHex(info.payloadHashHex),
            },
            { crypto, storage, sui, signer },
          );
          // result.backupKey is a disaster-recovery secret; never return it to the agent.
          return ok({
            machineId,
            manifestHash: info.manifestHashHex,
            memoryPointer: info.memoryPointer,
            blobId: result.blobId,
            bytes: info.bundleBytes,
            digest: result.digest,
            epochs,
            decryption: `${threshold}-of-${n || 1} Seal key server(s)`,
            note: 'A disaster-recovery backup key was generated in memory and intentionally NOT returned over MCP.',
          });
        } finally {
          rmSync(bundleDir, { recursive: true, force: true });
        }
      }),
  );

  server.registerTool(
    'reeg_restore',
    {
      title: 'Restore an environment',
      description:
        'Restore an environment from its latest checkpoint: read the pinned ciphertext from Walrus, decrypt it with a Seal session the operator authorizes, and unpack it into a working directory. Works for the owner and any grantee. Needs the reeg-engine binary and signs with the operator key.',
      inputSchema: {
        machineId: z.string().describe('the environment id'),
        dest: z
          .string()
          .optional()
          .describe('restore into this directory instead of the machine workdir'),
        ...overrides,
      },
    },
    async ({ machineId, dest: destArg, ...rest }) =>
      guard(async () => {
        const config = resolveConfig(rest);
        const pkg = requirePackage(config);
        const operator = requireOperator(config);
        const machine = getMachineOrNull(machineId);
        const dest = destArg ?? machine?.workdir;
        if (!dest) {
          throw new Error('no local workdir for this environment; pass "dest"');
        }

        const { sui, crypto, storage } = buildClients(config);
        const signer = loadKeypair(operator);
        // A key server's fullnode can briefly lag a just-mutated shared policy; retry transient
        // failures but fail fast on a definitive NoAccess.
        const bundle = await withSealRetry(() =>
          restore(
            { machineId, packageId: pkg, sealPackageId: originalPackageId(pkg) },
            { sui, storage, crypto, signer },
          ),
        );

        // Decrypted PLAINTEXT: stage in an owner-only temp dir with an owner-only, must-not-exist
        // file (mode 0600, flag 'wx') and delete the dir afterwards, so it never sits world-readable.
        const bundleDir = mkdtempSync(join(tmpdir(), 'reeg-restore-'));
        try {
          const bundlePath = join(bundleDir, 'checkpoint.bundle');
          writeFileSync(bundlePath, bundle, { mode: 0o600, flag: 'wx' });
          const memoryDest = join(dirname(dest), 'memory');
          const info = await engineRestore(config.engineBin, bundlePath, dest, memoryDest);
          return ok({
            machineId,
            dest,
            manifestHash: info.manifestHashHex,
            workdirRootHash: info.workdirRootHashHex,
            memoryPointer: info.memoryPointer,
          });
        } finally {
          rmSync(bundleDir, { recursive: true, force: true });
        }
      }),
  );

  return server;
}
