// reeg - the operator-facing CLI.
//
// Wraps @reeg/sdk so a person or a script can drive the whole loop: create, run,
// checkpoint, restore, fork, verify. The verify command must work with the Reeg backend
// stopped (it reads only Sui + Walrus). The same operations are callable from the SDK
// (build-roadmap phase G).

import { Command } from 'commander';
import { Agent, setGlobalDispatcher } from 'undici';
import { registerDoctor } from './commands/doctor';
import { registerEnclave } from './commands/enclave';
import { registerAudit, registerEvidence } from './commands/evidence';
import { registerCreate, registerFork, registerRetire } from './commands/lifecycle';
import { registerSelftest } from './commands/selftest';
import { registerCheckpoint, registerRestore, registerRun } from './commands/session';
import { registerGrant, registerRevoke } from './commands/sharing';
import { registerVerify } from './commands/verify';

// Force fresh HTTP connections before any command runs a network call. @mysten/walrus + sui reuse
// undici keep-alive sockets that can go stale across the multi-step Seal + Walrus round-trip inside a
// checkpoint, surfacing as `read ECONNRESET` mid-run. A short keep-alive timeout drops idle sockets
// so the next request opens a clean connection. (This was a sourced preload in the local env-setup script; now built in.)
setGlobalDispatcher(new Agent({ keepAliveTimeout: 10, keepAliveMaxTimeout: 10, connections: 128 }));

const program = new Command();

program
  .name('reeg')
  .description('version control for environments. Own it, share it, move it, prove it.')
  .version('0.0.0');

// doctor is a read-only preflight; it needs no signer and helps a first run not fail late.
registerDoctor(program);
// selftest proves the whole loop (create -> checkpoint -> restore -> verify -> retire) works
// from this machine, with a tiny throwaway environment.
registerSelftest(program);
registerCreate(program);
registerRun(program);
registerCheckpoint(program);
registerRestore(program);
registerFork(program);
registerRetire(program);
registerGrant(program);
registerRevoke(program);
// verify needs no signer and reads only public data, so it works with the backend offline.
registerVerify(program);
// evidence/audit turn that same record into a portable file an auditor can keep (Art. 12).
registerEvidence(program);
registerAudit(program);
// the optional Nautilus tier: register a measured enclave so `checkpoint --attest` can prove
// which code produced a checkpoint.
registerEnclave(program);

// Await async actions and turn a thrown error into one clean line, not a raw Node stack trace.
// REEG_DEBUG=1 keeps the full stack for when you actually want it.
program.parseAsync().catch((err: unknown) => {
  if (process.env.REEG_DEBUG === '1') {
    console.error(err);
  } else {
    console.error(`error: ${humanMessage(err)}`);
  }
  process.exitCode = 1;
});

function humanMessage(err: unknown): string {
  const name = (err as { constructor?: { name?: string } })?.constructor?.name;
  const message = (err as { message?: string })?.message ?? String(err);
  if (name === 'NoAccessError') {
    return 'access denied. You are not permitted to decrypt this environment (you may not be a grantee, or access was revoked or has expired).';
  }
  return message;
}
