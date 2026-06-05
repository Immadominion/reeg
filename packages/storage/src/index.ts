// @reeg/storage - Walrus adapter for Reeg.
//
// Stores the already-encrypted checkpoint ciphertext on Walrus and reads it back. It never
// sees plaintext (that is @reeg/crypto) and never anchors on chain (that is @reeg/chain). The
// blob id is the content hash, so stored bytes cannot be swapped without changing the id.
//
// The WalrusClient is injected rather than constructed here, so the network/config choice
// lives in one place (the sdk/config layer) and this stays unit-focused and decoupled.

import type { Signer } from '@mysten/sui/cryptography';
import type { WalrusClient } from '@mysten/walrus';
import { blobIdFromInt, blobIdToInt } from '@mysten/walrus';

/** A blob written to Walrus. `blobIdU256` is the same id in the form the Move Machine pins. */
export interface StoredBlob {
  blobId: string;
  blobIdU256: bigint;
  blobObjectId: string;
}

/** How long to keep a blob paid for, and who pays. Epochs are ~two weeks each; this is the
 *  cost and retention lever surfaced honestly to the operator (NFR-7). An optional abort
 *  signal lets a caller cancel a long upload. */
export interface StoreOptions {
  epochs: number;
  signer: Signer;
  deletable?: boolean;
  signal?: AbortSignal;
}

export class WalrusBlobStore {
  constructor(private readonly client: WalrusClient) {}

  /** Store ciphertext and return its blob id in both string and u256 forms. */
  async store(ciphertext: Uint8Array, options: StoreOptions): Promise<StoredBlob> {
    const { blobId, blobObject } = await this.client.writeBlob({
      blob: ciphertext,
      deletable: options.deletable ?? false,
      epochs: options.epochs,
      signer: options.signer,
      signal: options.signal ?? new AbortController().signal,
    });
    return { blobId, blobIdU256: blobIdToInt(blobId), blobObjectId: blobObject.id };
  }

  /** Read ciphertext by its Walrus blob id string. */
  async read(blobId: string, signal?: AbortSignal): Promise<Uint8Array> {
    return this.client.readBlob({ blobId, signal: signal ?? new AbortController().signal });
  }

  /** Read ciphertext by the u256 blob id pinned on the Machine object, so a verifier or
   *  restore path can fetch exactly what the chain points at. */
  async readByU256(blobIdU256: bigint, signal?: AbortSignal): Promise<Uint8Array> {
    return this.read(blobIdFromInt(blobIdU256), signal);
  }
}
