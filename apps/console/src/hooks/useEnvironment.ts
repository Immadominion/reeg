import { verifyFromChain } from '@reeg/verify';
import { useQuery } from '@tanstack/react-query';
import { loadAccess } from '../lib/access';
import { CONFIG, readClient } from '../lib/config';
import { loadEnvironment } from '../lib/environment';

/** Load an environment for display. Keyed by id so navigation between environments is cached. */
export function useEnvironment(id: string) {
  return useQuery({
    queryKey: ['environment', id],
    queryFn: () => loadEnvironment(readClient, CONFIG.packageId, id),
    enabled: id.length > 0,
  });
}

/**
 * Independent verification of an environment, run on demand. Disabled until triggered (call
 * `refetch`) so the Verify button stays an explicit, reassuring action. Reads only public Sui
 * data, so it holds even with the Reeg backend offline.
 */
export function useVerification(id: string) {
  return useQuery({
    queryKey: ['verify', id],
    queryFn: () => verifyFromChain(readClient, CONFIG.packageId, id),
    enabled: false,
    gcTime: 0,
  });
}

/** Who currently has access to an environment (its shared AccessPolicy grants), for the share
 *  panel. Separate from useEnvironment so a grant or revoke can refresh access alone. */
export function useAccess(id: string) {
  return useQuery({
    queryKey: ['access', id],
    queryFn: () => loadAccess(readClient, id),
    enabled: id.length > 0,
  });
}
