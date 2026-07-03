// The headline acceptance test: run -> checkpoint -> kill the host ->
// restore on a fresh host that never saw the original -> verify with the Reeg backend offline ->
// share to another host -> revoke. It drives the real `reeg` CLI binary, with a distinct
// REEG_HOME per simulated host, so "kill host A and restore on host B" is faithful: host B starts
// with no local state and rebuilds the working directory from public Sui + Walrus data alone,
// using only the machine id and the operator's own key. This is C1 through C4 together.
//
// Run: REEG_ENGINE=engine/target/debug/reeg-engine pnpm --filter @reeg/test run live:acceptance
// Spends a little testnet SUI (gas) and WAL (storage). Operator/grantee via REEG_OPERATOR /
// REEG_GRANTEE; both keys must be in the local sui keystore (loaded in memory, never printed).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../packages/cli/dist/index.js', import.meta.url));
const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../config/testnet.json', import.meta.url)), 'utf8'),
) as { reeg: { packageId: string } };
const PACKAGE = config.reeg.packageId;
const ENGINE = process.env.REEG_ENGINE;
const OPERATOR = process.env.REEG_OPERATOR;
const GRANTEE = process.env.REEG_GRANTEE;

// Each simulated host is a separate REEG_HOME, so no host shares another's working directory or
// local machine cache. The operator carries only their key (the shared sui keystore) between them.
// Every command carries a hard timeout (a stalled Walrus upload or RPC otherwise hangs the whole
// run forever) and captures stderr so a failure names its cause.
const COMMAND_TIMEOUT_MS = 300_000;

function reeg(home: string, operator: string, args: string[]): string {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: COMMAND_TIMEOUT_MS,
      env: {
        ...process.env,
        REEG_ENGINE: ENGINE,
        REEG_PACKAGE_ID: PACKAGE,
        REEG_NETWORK: 'testnet',
        REEG_HOME: home,
        REEG_OPERATOR: operator,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err as Error & { stderr?: string; signal?: string };
    const stderr = (e.stderr ?? '').trim();
    const cause = e.signal === 'SIGTERM' ? `timed out after ${COMMAND_TIMEOUT_MS / 1000}s` : stderr;
    const wrapped = new Error(`reeg ${args[0]} failed: ${cause || e.message}`);
    (wrapped as Error & { stderr?: string }).stderr = stderr;
    throw wrapped;
  }
}

// Live-network steps can fail transiently (an RPC connection reset, a Walrus relay hiccup, a Seal
// key-server fullnode lagging a just-mutated policy). Retry those with backoff; a definitive
// access denial is a verdict, never retried (revoke correctness depends on it staying final).
async function step<T>(label: string, fn: () => T, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return fn();
    } catch (err) {
      if (isAccessDenied(err)) {
        throw err;
      }
      lastError = err;
      if (attempt < attempts) {
        console.log(`  (${label}: attempt ${attempt} failed, retrying) ${(err as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

function isAccessDenied(err: unknown): boolean {
  const text = `${(err as Error).message} ${(err as { stderr?: string }).stderr ?? ''}`;
  return /access denied|NoAccess/i.test(text);
}

// A deterministic hash of a directory tree (sorted relative paths plus file contents), so two
// restores on different hosts can be compared for byte-identical equality independent of order.
function treeHash(dir: string): string {
  const h = createHash('sha256');
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const childRel = rel ? `${rel}/${name}` : name;
      const abs = join(dir, childRel);
      if (statSync(abs).isDirectory()) {
        h.update(`D:${childRel}\n`);
        walk(childRel);
      } else {
        h.update(`F:${childRel}\n`);
        h.update(readFileSync(abs));
        h.update('\n');
      }
    }
  };
  walk('');
  return h.digest('hex');
}

function field(output: string, label: string): string {
  const match = output.match(new RegExp(`${label}:\\s*(\\S+)`));
  if (!match) {
    throw new Error(`could not find "${label}" in CLI output:\n${output}`);
  }
  return match[1] as string;
}

function phase(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function main() {
  if (!PACKAGE || PACKAGE === '0x0') {
    throw new Error('config/testnet.json has no published packageId');
  }
  if (!ENGINE) {
    throw new Error('set REEG_ENGINE to the built reeg-engine binary (cargo build in engine/)');
  }
  if (!OPERATOR || !GRANTEE) {
    throw new Error('set REEG_OPERATOR and REEG_GRANTEE to two funded testnet addresses');
  }

  const root = mkdtempSync(join(tmpdir(), 'reeg-acceptance-'));
  const hostA = join(root, 'host-a'); // creates and checkpoints, then is killed
  const hostB = join(root, 'host-b'); // a fresh owner host that never saw host A
  const hostC = join(root, 'host-c'); // a fresh grantee host
  const restoreB = join(root, 'restore-b');
  const restoreC = join(root, 'restore-c');
  const keepA = join(root, 'expected-a'); // a copy of host A's workdir taken before the kill

  console.log(`package : ${PACKAGE}`);
  console.log(`operator: ${OPERATOR}`);
  console.log(`grantee : ${GRANTEE}`);
  console.log(`scratch : ${root}`);

  try {
    phase('Host A: create a shareable environment and do work in it');
    const created = await step('create', () => reeg(hostA, OPERATOR, ['create']));
    const machineId = (created.match(/Created environment (0x[0-9a-fA-F]+)/) ?? [])[1];
    if (!machineId) {
      throw new Error(`could not find the new machine id in CLI output:\n${created}`);
    }
    console.log(`  machine: ${machineId}`);
    reeg(hostA, OPERATOR, [
      'run',
      machineId,
      '--',
      'sh',
      '-c',
      'echo "owned, shareable, portable" > notes.md && mkdir -p src/lib && printf "a\\nb\\nc\\n" > src/lib/data.txt && echo done > src/STATUS',
    ]);
    const workA = join(hostA, 'machines', machineId, 'work');
    cpSync(workA, keepA, { recursive: true });
    const expectedTree = treeHash(keepA);
    console.log(`  workdir tree hash: ${expectedTree}`);

    phase('Host A: checkpoint (pack -> encrypt -> Walrus -> anchor on Sui)');
    const checkpoint = await step('checkpoint', () =>
      reeg(hostA, OPERATOR, ['checkpoint', machineId, '--epochs', '1']),
    );
    const recordedManifest = field(checkpoint, 'manifest');
    console.log(`  recorded manifest hash: ${recordedManifest}`);

    phase('Kill host A (its working directory and local state are gone)');
    rmSync(hostA, { recursive: true, force: true });
    assert(!dirExists(hostA), 'host A is gone; nothing local remains to restore from');

    phase('Host B: a fresh host restores from Sui + Walrus alone');
    const restoredB = await step('restore on host B', () =>
      reeg(hostB, OPERATOR, ['restore', machineId, '--dest', restoreB]),
    );
    assert(
      field(restoredB, 'manifest') === recordedManifest,
      'restored manifest matches the record',
    );
    assert(
      treeHash(restoreB) === expectedTree,
      'host B working directory is byte-identical to host A',
    );
    const rootB = field(restoredB, 'root');

    phase('Verify on host B with the Reeg backend offline (reads only Sui + Walrus)');
    const verifyB = await step('verify on host B', () =>
      reeg(hostB, OPERATOR, ['verify', machineId]),
    );
    assert(verifyB.includes(`Verified: ${machineId}`), 'independent verification passed');

    phase('Share across hosts: owner grants a second address');
    await step('grant', () =>
      reeg(hostB, OPERATOR, ['grant', machineId, GRANTEE, '--role', 'restore']),
    );

    phase('Host C: the grantee, on its own fresh host, restores byte-identically');
    const restoredC = await step('grantee restore on host C', () =>
      reeg(hostC, GRANTEE, ['restore', machineId, '--dest', restoreC]),
    );
    assert(field(restoredC, 'root') === rootB, 'grantee restore root matches the owner restore');
    assert(
      treeHash(restoreC) === expectedTree,
      'grantee host C working directory is byte-identical',
    );

    phase('Revoke: the grantee is denied on the next attempt (forward-looking)');
    await step('revoke', () => reeg(hostB, OPERATOR, ['revoke', machineId, GRANTEE]));
    // The denial must be a definitive access denial, not any failure: a transient network error
    // here would otherwise read as a successful revoke.
    let denied = false;
    try {
      reeg(hostC, GRANTEE, ['restore', machineId, '--dest', join(root, 'restore-c2')]);
    } catch (err) {
      if (!isAccessDenied(err)) {
        throw new Error(
          `grantee restore failed, but not with an access denial: ${(err as Error).message}`,
        );
      }
      denied = true;
    }
    assert(denied, 'grantee restore is denied after revoke (a definitive access denial)');

    phase('Final verify still passes with the grant and revoke in the provenance chain');
    const verifyFinal = await step('final verify', () =>
      reeg(hostB, OPERATOR, ['verify', machineId]),
    );
    assert(
      verifyFinal.includes(`Verified: ${machineId}`),
      'verification passes with sharing history',
    );

    phase('Retire: a permanent end-of-life marker; the record stays verifiable');
    await step('retire', () => reeg(hostB, OPERATOR, ['retire', machineId]));
    const verifyRetired = await step('verify after retire', () =>
      reeg(hostB, OPERATOR, ['verify', machineId]),
    );
    assert(
      verifyRetired.includes(`Verified: ${machineId}`),
      'verification still passes after retire',
    );
    // (That a retired environment declines further checkpoints is covered by the localnet CLI
    // test, where the machine's local state exists; host B here only ever restored by --dest.)

    console.log('\nACCEPTANCE TEST OK');
    console.log(`machine: ${machineId}`);
    console.log(`open in the Console: #/env/${machineId}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
    // The operator keystore lives in the user's home, never in scratch; nothing to clean there.
    void homedir;
  }
}

function dirExists(dir: string): boolean {
  try {
    statSync(dir);
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error('\nACCEPTANCE TEST FAILED');
  console.error(err);
  process.exitCode = 1;
});
