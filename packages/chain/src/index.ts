// @reeg/chain - Sui client for Reeg.
//
// Reads the Machine object and builds the PTBs that drive it. This is the only package that
// names the on-chain Move package; everything else in packages/ and apps/ goes through here.
// It holds no signer and executes nothing: callers build a transaction here and sign/execute
// it with their own client and key, so the trust boundary stays on the operator's side.

export type { AccessPolicy, Grant } from './access';
export { NotAnAccessPolicyError, parseAccessPolicyFields, readAccessPolicy } from './access';
export { buildRegisterAttestedCommand, buildRegisterEnclave } from './attestation';
export type { Machine } from './machine';
export { parseMachineFields, readMachine } from './machine';
export type { CheckpointArgs } from './transactions';
export {
  addRegisterCheckpoint,
  buildCreateMachine,
  buildCreateSharedMachine,
  buildFork,
  buildGrant,
  buildRegisterCheckpoint,
  buildRetire,
  buildRevoke,
  buildSealApprove,
  buildSealApproveAllowlist,
  buildSealApproveUntil,
} from './transactions';
