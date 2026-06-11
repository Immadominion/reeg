// @reeg/verify - the independent verifier (the product's soul).
//
// Given a Machine id and a Sui RPC, it re-walks the provenance chain and confirms it reaches
// the on-chain head, with no Reeg backend and no decryption. For a forked Machine it also
// verifies the lineage: that the child's genesis is cryptographically bound to a real head of
// the named parent. This is the hard invariant (NFR-1): verifying a past run reads only public
// Sui data. An optional injected blob reader can additionally confirm the checkpoint
// ciphertext is retrievable from Walrus; the chain verification never requires it. The package
// is deliberately dependency-light so the Console (a static Walrus Site) can run it in the
// browser, and any blob reader is injected rather than imported.

export type {
  AttestationCheck,
  AttestationRecord,
  AttestationReport,
  EnclaveIdentity,
} from './attestation';
export { fetchAttestations, readEnclaveConfig, verifyAttestation } from './attestation';
export type { Evidence, EvidenceComparison, EvidenceEntry } from './evidence';
export {
  compareEvidence,
  EVIDENCE_SCHEMA_VERSION,
  fromEvidence,
  toEvidence,
  verifyEvidence,
} from './evidence';
export { blake2b256, blake3Hash, bytesEqual, concatBytes, fromHex, toHex, utf8 } from './hash';
export type { Manifest, ManifestPackage } from './manifest';
export {
  canonicalManifestBytes,
  manifestBytesMatch,
  manifestHashHex,
  SCHEMA_VERSION,
} from './manifest';
export type { LinkedEntry, ProvenanceEntry } from './provenance';
export {
  collectHeads,
  computeEntryHash,
  computeForkChildHead,
  EVENT_CHECKPOINT,
  EVENT_COMMAND,
  EVENT_FORK,
  EVENT_GRANT,
  EVENT_RETIRE,
  EVENT_REVOKE,
  genesisHead,
  orderByLinkage,
  replayChain,
} from './provenance';
export type { AccessKind, AccessRecord, ForkEvent, VerifyFromChainOptions } from './readers';
export {
  anchorEvidence,
  exportEvidence,
  ForkEventMissingError,
  fetchAccessLinks,
  fetchCheckpointLinks,
  fetchForkEvent,
  fetchProvenanceEntries,
  fetchRetireLinks,
  gatherVerifyInput,
  isRetired,
  machineIdBytes,
  reconstructAccessTimeline,
  verifyFromChain,
} from './readers';
export type { Check, ForkProof, VerificationReport, VerifyInput } from './verifier';
export { verifyMachine } from './verifier';
