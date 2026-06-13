import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { isRetired } from '@reeg/verify';

/**
 * isRetired, but fail OPEN: a transient RPC or event-indexer error returns false rather than
 * throwing. The retirement guard on the checkpoint path must never let a read failure block a
 * legitimate checkpoint; only a confirmed retirement returns true. REEG_DEBUG surfaces the error.
 */
export async function isRetiredOrFalse(
  sui: SuiJsonRpcClient,
  packageId: string,
  machineId: string,
): Promise<boolean> {
  try {
    return await isRetired(sui, packageId, machineId);
  } catch (err) {
    if (process.env.REEG_DEBUG === '1') {
      console.error(err);
    }
    return false;
  }
}
