// reeg - the operator-facing CLI.
//
// Wraps @reeg/sdk so a person or a script can drive the whole loop: create, run,
// checkpoint, restore, fork, verify. The verify command must work with the Reeg backend
// stopped (it reads only Sui + Walrus). The same operations are callable from the SDK
// (build-roadmap phase G).

import { Command } from 'commander';
import { registerAudit, registerEvidence } from './commands/evidence';
import { registerCreate, registerFork, registerRetire } from './commands/lifecycle';
import { registerCheckpoint, registerRestore, registerRun } from './commands/session';
import { registerGrant, registerRevoke } from './commands/sharing';
import { registerVerify } from './commands/verify';

const program = new Command();

program
  .name('reeg')
  .description('The computer your AI agents live in. Own it, share it, move it, prove it.')
  .version('0.0.0');

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
