import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Local, per-operator state shared with @reeg/cli (same REEG_HOME/state.json): which working
// directory belongs to which environment. A convenience cache only; the authoritative record is on
// chain, so losing it loses nothing that cannot be re-derived (the workdir is rebuilt by restore).
export interface MachineState {
  workdir: string;
  network: string;
  createdAt: string;
  policyId?: string;
}

interface StateFile {
  machines: Record<string, MachineState>;
}

function root(): string {
  return process.env.REEG_HOME ?? join(homedir(), '.reeg');
}

function statePath(): string {
  return join(root(), 'state.json');
}

function read(): StateFile {
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8')) as StateFile;
  } catch {
    return { machines: {} };
  }
}

function write(state: StateFile): void {
  mkdirSync(root(), { recursive: true });
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}

export function workdirFor(machineId: string): string {
  return join(root(), 'machines', machineId, 'work');
}

export function logFor(machineId: string): string {
  return join(root(), 'machines', machineId, 'log.json');
}

export function memoryFor(machineId: string): string {
  return join(root(), 'machines', machineId, 'memory');
}

export function recordMachine(
  machineId: string,
  network: string,
  createdAt: string,
  policyId?: string,
): MachineState {
  const state = read();
  const entry: MachineState = { workdir: workdirFor(machineId), network, createdAt, policyId };
  state.machines[machineId] = entry;
  mkdirSync(entry.workdir, { recursive: true });
  mkdirSync(memoryFor(machineId), { recursive: true });
  write(state);
  return entry;
}

export function getMachine(machineId: string): MachineState {
  const entry = getMachineOrNull(machineId);
  if (!entry) {
    throw new Error(`unknown environment ${machineId}; create it with the reeg_create tool first`);
  }
  return entry;
}

export function getMachineOrNull(machineId: string): MachineState | null {
  return read().machines[machineId] ?? null;
}

/** Every environment this operator has created/restored locally, for the reeg_list tool. */
export function listMachines(): Array<MachineState & { machineId: string }> {
  return Object.entries(read().machines).map(([machineId, state]) => ({ machineId, ...state }));
}
