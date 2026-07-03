import { normalizeSuiAddress } from '@mysten/sui/utils';

// The published Reeg upgrade lineages: latest (upgraded) package id -> original (first-published)
// id. Two platform behaviors make the original id load-bearing:
//   - Seal namespaces the encryption identity and SessionKey by a package's FIRST version and
//     rejects an upgraded id outright ("Package <id> is not the first version").
//   - Move event types are tagged with the DEFINING package id, so querying events with an
//     upgraded id silently returns nothing (a verify would see zero checkpoints).
// Any package id not in this map is assumed to be its own first version.
const KNOWN_ORIGINALS: Record<string, string> = {
  // testnet: v2 added the attestation module; the machine + access modules ship in v1.
  '0x8f2faf0b89e248f498cb0bc4b0ef98511613c4d7884e8ce41f0bc255246ca1d2':
    '0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28',
  // mainnet: upgraded to add the attestation module.
  '0xfaa6b4af63a639c06e5d02c969c28111db5f01caea1067132c789fa7ebdb241e':
    '0xf3e012521c4180154d452665826ca96f8b38b167d5e3d4d8af605f0528dc84f3',
};

/**
 * The ORIGINAL (first-published) id for a package id: a known Reeg upgrade lineage maps to its
 * first version; anything else is returned unchanged. Use it wherever Seal or a machine/access
 * event-type query needs the defining package. Attestation events are the exception: that module
 * was ADDED by the upgrade, so its events are defined by (and queried with) the upgraded id.
 */
export function originalPackageId(packageId: string): string {
  if (!packageId) {
    return packageId;
  }
  return KNOWN_ORIGINALS[normalizeSuiAddress(packageId)] ?? packageId;
}
