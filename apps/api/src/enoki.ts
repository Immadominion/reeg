import { EnokiClient } from '@mysten/enoki';
import type { ApiConfig } from './config';

/** Thrown when a sponsorship is requested but no Enoki private key is configured. Maps to 503. */
export class PaymasterUnavailable extends Error {
  constructor() {
    super('sponsorship unavailable: ENOKI_SECRET_KEY is not configured on the paymaster');
    this.name = 'PaymasterUnavailable';
  }
}

/**
 * The Reeg paymaster: it sponsors Sui gas for Reeg's own package functions through Enoki's managed
 * gas pool, so an end user or agent never holds SUI. The private key lives here and only here; it is
 * never returned to the client. This service is privileged but NOT trusted for verification — a past
 * run still verifies offline from public Sui with this service stopped (see agent-access.md).
 */
export class Paymaster {
  private readonly client: EnokiClient | null;

  constructor(private readonly config: ApiConfig) {
    // Build lazily-nullable: the server still boots without a key (health checks work); the
    // sponsorship calls below surface a clean 503 until the key is wired.
    this.client = config.enokiSecretKey ? new EnokiClient({ apiKey: config.enokiSecretKey }) : null;
  }

  private require(): EnokiClient {
    if (!this.client) {
      throw new PaymasterUnavailable();
    }
    return this.client;
  }

  /**
   * Sponsor a transaction kind the client built. The client signs as `sender`; Enoki's sponsor
   * signs and pays the gas. We always pass the server's configured Reeg targets as the allowlist,
   * never a client-supplied one, so only Reeg operations can ever be sponsored.
   */
  async sponsor(input: {
    transactionKindBytes: string;
    sender: string;
  }): Promise<{ bytes: string; digest: string }> {
    if (!this.config.packageId) {
      throw new Error('REEG_PACKAGE_ID is not set; cannot build the sponsorship allowlist');
    }
    return this.require().createSponsoredTransaction({
      network: this.config.network,
      transactionKindBytes: input.transactionKindBytes,
      sender: input.sender,
      allowedMoveCallTargets: this.config.sponsoredTargets,
    });
  }

  /** Execute a sponsored transaction the client signed, by its Enoki digest. */
  async execute(input: { digest: string; signature: string }): Promise<{ digest: string }> {
    return this.require().executeSponsoredTransaction(input);
  }
}
