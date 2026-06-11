import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface RunResult {
  exitCode: number;
  seq: number;
}

export interface CheckpointInfo {
  manifestHashHex: string;
  workdirRootHashHex: string;
  /** Content hash of the captured agent memory, or null when the run has no memory. */
  memoryPointer: string | null;
  payloadHashHex: string;
  bundleBytes: number;
}

export interface RestoreInfo {
  manifestHashHex: string;
  workdirRootHashHex: string;
  memoryPointer: string | null;
}

async function invoke(bin: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  try {
    const { stdout } = await run(bin, args, { maxBuffer: 64 * 1024 * 1024, env });
    return stdout;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ENOENT') {
      throw new Error(
        `reeg-engine not found at '${bin}'. Build it (cargo build --manifest-path engine/Cargo.toml) and set REEG_ENGINE to its path.`,
      );
    }
    throw err;
  }
}

/** Run a command in the Machine working directory, appending to its command log. `memoryDir`, when
 *  given, is exposed to the command as REEG_MEMORY_DIR so an agent's memory backend (MemWal or
 *  plain files) writes there; that directory is captured on the next checkpoint. */
export async function engineRun(
  bin: string,
  workdir: string,
  log: string,
  argv: string[],
  memoryDir?: string,
): Promise<RunResult> {
  const env = memoryDir ? { ...process.env, REEG_MEMORY_DIR: memoryDir } : undefined;
  return JSON.parse(
    await invoke(bin, ['run', '--workdir', workdir, '--log', log, '--', ...argv], env),
  );
}

/** Pack the working directory (and `memory`, if given) into a checkpoint bundle file. */
export async function engineCheckpoint(
  bin: string,
  workdir: string,
  out: string,
  log: string,
  memory?: string,
): Promise<CheckpointInfo> {
  const args = ['checkpoint', '--workdir', workdir, '--out', out, '--log', log];
  if (memory) {
    args.push('--memory', memory);
  }
  return JSON.parse(await invoke(bin, args));
}

/** Unpack a checkpoint bundle file into a destination directory, rebuilding `memory` if given and
 *  the bundle carries a memory pointer. */
export async function engineRestore(
  bin: string,
  bundle: string,
  dest: string,
  memory?: string,
): Promise<RestoreInfo> {
  const args = ['restore', '--bundle', bundle, '--dest', dest];
  if (memory) {
    args.push('--memory', memory);
  }
  return JSON.parse(await invoke(bin, args));
}

/** Fetch the local Nautilus enclave's attestation document (hex) over vsock. Linux/host only. */
export async function engineAttestDoc(bin: string, cid: number, port: number): Promise<string> {
  const out = JSON.parse(
    await invoke(bin, ['attest', 'doc', '--cid', String(cid), '--port', String(port)]),
  );
  return out.documentHex as string;
}

/** Ask the local enclave to sign a checkpoint's frozen preimage; returns the ed25519 signature (hex).
 *  The enclave rebuilds the preimage from these fields, so it only signs well-formed attestations. */
export async function engineAttestSign(
  bin: string,
  cid: number,
  port: number,
  machineId: string,
  seq: bigint,
  manifestHashHex: string,
): Promise<string> {
  const out = JSON.parse(
    await invoke(bin, [
      'attest',
      'sign',
      '--cid',
      String(cid),
      '--port',
      String(port),
      '--machine-id',
      machineId,
      '--seq',
      seq.toString(),
      '--manifest-hash',
      manifestHashHex,
    ]),
  );
  return out.signatureHex as string;
}
