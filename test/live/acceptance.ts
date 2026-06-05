// The headline acceptance demo (build-roadmap phase J): run -> checkpoint -> kill the host ->
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
function reeg(home: string, operator: string, args: string[]): string {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      REEG_ENGINE: ENGINE,
      REEG_PACKAGE_ID: PACKAGE,
      REEG_NETWORK: 'testnet',
      REEG_HOME: home,
      REEG_OPERATOR: operator,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
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
    const created = reeg(hostA, OPERATOR, ['create']);
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
    const checkpoint = reeg(hostA, OPERATOR, ['checkpoint', machineId, '--epochs', '1']);
    const recordedManifest = field(checkpoint, 'manifest');
    console.log(`  recorded manifest hash: ${recordedManifest}`);

    phase('Kill host A (its working directory and local state are gone)');
    rmSync(hostA, { recursive: true, force: true });
    assert(!dirExists(hostA), 'host A is gone; nothing local remains to restore from');

    phase('Host B: a fresh host restores from Sui + Walrus alone');
    const restoredB = reeg(hostB, OPERATOR, ['restore', machineId, '--dest', restoreB]);
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
    const verifyB = reeg(hostB, OPERATOR, ['verify', machineId]);
    assert(verifyB.includes(`Verified: ${machineId}`), 'independent verification passed');

    phase('Share across hosts: owner grants a second address');
    reeg(hostB, OPERATOR, ['grant', machineId, GRANTEE, '--role', 'restore']);

    phase('Host C: the grantee, on its own fresh host, restores byte-identically');
    const restoredC = reeg(hostC, GRANTEE, ['restore', machineId, '--dest', restoreC]);
    assert(field(restoredC, 'root') === rootB, 'grantee restore root matches the owner restore');
    assert(
      treeHash(restoreC) === expectedTree,
      'grantee host C working directory is byte-identical',
    );

    phase('Revoke: the grantee is denied on the next attempt (forward-looking)');
    reeg(hostB, OPERATOR, ['revoke', machineId, GRANTEE]);
    let denied = false;
    try {
      reeg(hostC, GRANTEE, ['restore', machineId, '--dest', join(root, 'restore-c2')]);
    } catch {
      denied = true;
    }
    assert(denied, 'grantee restore is denied after revoke');

    phase('Final verify still passes with the grant and revoke in the provenance chain');
    const verifyFinal = reeg(hostB, OPERATOR, ['verify', machineId]);
    assert(
      verifyFinal.includes(`Verified: ${machineId}`),
      'verification passes with sharing history',
    );

    console.log('\nACCEPTANCE DEMO OK');
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
  console.error('\nACCEPTANCE DEMO FAILED');
  console.error(err);
  process.exitCode = 1;
});
