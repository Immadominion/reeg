// @reeg/sdk - the public TypeScript SDK.
//
// Ties @reeg/chain, @reeg/storage, and @reeg/crypto into the verbs a user runs. Entry points
// are named for the verb (checkpoint here; create, restore, fork, verify follow in later
// phases), matching the CLI and the use cases. The SDK orchestrates; it delegates encryption
// to crypto, storage to storage, and anchoring to chain, and it consumes the engine's bundle
// across the content-addressed artifact boundary without inspecting it.

// Re-export the typed chain readers and the sharing PTB builders so SDK consumers (including the
// Console's wallet flow) have one import surface.
export type { AccessPolicy, Grant, Machine } from '@reeg/chain';
export { buildFork, buildGrant, buildRevoke, readAccessPolicy, readMachine } from '@reeg/chain';
export type {
  CheckpointBundle,
  CheckpointClients,
  CheckpointContext,
  CheckpointResult,
} from './checkpoint';
export { checkpoint } from './checkpoint';
export type { LifecycleClients, MachineResult } from './lifecycle';
export { createMachine, fork, retire } from './lifecycle';
export type { RestoreClients } from './restore';
export { restore } from './restore';
export type {
  GrantOptions,
  RevokeOptions,
  ShareableMachineResult,
  SharingClients,
} from './sharing';
export { createShareableMachine, grant, RIGHTS_RESTORE, RIGHTS_VIEW, revoke } from './sharing';
