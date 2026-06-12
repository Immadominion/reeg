import { useCurrentAccount } from '@mysten/dapp-kit';
import { type Machine, readMachine } from '@reeg/sdk';
import { isRetired, verifyAttestation, verifyFromChain } from '@reeg/verify';
import { useQuery } from '@tanstack/react-query';
import { loadAccess } from '../lib/access';
import { CONFIG, hasPackageConfigured, readClient } from '../lib/config';
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

/**
 * The environments the connected wallet owns, as full Machine records (not just ids) so the
 * dashboard can show snapshot counts and lineage at a glance. Reads the owned Machine objects,
 * then their typed state. Disabled until a wallet is connected and a package is configured.
 */
export function useOwnedMachines() {
  const account = useCurrentAccount();
  const address = account?.address;
  return useQuery({
    queryKey: ['owned-machines', address, CONFIG.packageId],
    enabled: Boolean(address) && hasPackageConfigured(),
    queryFn: async (): Promise<Machine[]> => {
      const res = await readClient.getOwnedObjects({
        owner: address as string,
        filter: { StructType: `${CONFIG.packageId}::machine::Machine` },
        options: { showType: true },
      });
      const ids = res.data.map((o) => o.data?.objectId).filter((id): id is string => Boolean(id));
      const machines = await Promise.all(
        ids.map((id) => readMachine(readClient, id).catch(() => null)),
      );
      return machines.filter((m): m is Machine => m !== null);
    },
  });
}

/**
 * The optional Nautilus attestation for an environment: whether a measured enclave attested the
 * code that produced its checkpoints, verified offline against on-chain signatures and PCRs. A
 * non-attested environment returns `attested: false` and the page shows a calm "no attestation"
 * note — it is strictly additive, never a failure.
 */
export function useAttestation(id: string) {
  return useQuery({
    queryKey: ['attestation', id, CONFIG.packageId],
    queryFn: () => verifyAttestation(readClient, CONFIG.packageId, id),
    enabled: id.length > 0 && hasPackageConfigured(),
  });
}

/** Whether an environment has been retired (a permanent, verifiable end-of-life marker on its
 *  provenance chain). Read straight from Sui. */
export function useRetired(id: string) {
  return useQuery({
    queryKey: ['retired', id, CONFIG.packageId],
    queryFn: () => isRetired(readClient, CONFIG.packageId, id),
    enabled: id.length > 0 && hasPackageConfigured(),
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
