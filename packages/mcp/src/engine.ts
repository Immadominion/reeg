import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Mirrors @reeg/cli's engine wrapper: the MCP shells to the same reeg-engine binary the CLI does,
// over a content-addressed JSON boundary, so checkpoint/restore behave identically. Anything that
// needs the engine degrades to a clear error when REEG_ENGINE is unset and it is not on PATH.
const run = promisify(execFile);

export interface RunResult {
  exitCode: number;
  seq: number;
}

export interface CheckpointInfo {
  manifestHashHex: string;
  workdirRootHashHex: string;
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
