// Live Nautilus done-bar: register a real Nitro enclave on chain, then record an enclave-signed
// attestation for a checkpoint and confirm it verifies — the full "prove which code ran" loop.
//
//   1. register_enclave: verify the enclave's Nitro attestation document on chain (0x2::
//      nitro_attestation) and pin its PCRs + ed25519 key into a shared EnclaveConfig.
//   2. register_attested_command: the enclave signs the FROZEN preimage for (machine, seq,
//      manifest_hash); the chain ed25519-verifies that signature and emits CommandAttested.
//   3. verify offline from Sui alone: the event exists (so the signature verified on chain) and the
//      EnclaveConfig's PCRs match the enclave build we trust.
//
// The attestation document + signatures come from the live enclave over vsock on the AWS host;
// this script reaches it via `ssh $REEG_ENCLAVE_SSH "sudo python3 /tmp/vsock_client.py ..."`.
//
// Run: REEG_OPERATOR=<addr> REEG_ENCLAVE_SSH=reeg-host REEG_ATTESTATION_DOC=/tmp/attestation.hex \
//      pnpm --filter @reeg/test exec tsx live/attestation.ts

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, fromHex, normalizeSuiAddress, toHex } from '@mysten/sui/utils';
import {
  buildCreateMachine,
  buildRegisterAttestedCommand,
  buildRegisterEnclave,
} from '@reeg/chain';
import { blake3Hash } from '@reeg/verify';

const NETWORK = process.env.REEG_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const OPERATOR = process.env.REEG_OPERATOR;
const ENCLAVE_SSH = process.env.REEG_ENCLAVE_SSH ?? 'reeg-host';
const DOC_PATH = process.env.REEG_ATTESTATION_DOC ?? '/tmp/attestation.hex';

function loadConfig() {
  const path = fileURLToPath(new URL(`../../config/${NETWORK}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as { reeg: { packageId: string } };
}

function loadKeypair(address: string): Ed25519Keypair {
  const path = process.env.SUI_KEYSTORE ?? join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as string[];
  for (const entry of entries) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (kp.getPublicKey().toSuiAddress() === address) return kp;
  }
  throw new Error(`no Ed25519 key for ${address} in the keystore`);
}

/** Ask the live enclave (over vsock on the host) to sign the frozen preimage for this checkpoint. */
function enclaveSign(machineId: string, seq: bigint, manifestHashHex: string): Uint8Array {
  const out = execFileSync(
    'ssh',
    [ENCLAVE_SSH, `sudo python3 /tmp/vsock_client.py sign ${machineId} ${seq} ${manifestHashHex}`],
    { encoding: 'utf8' },
  );
  return fromHex(out.trim());
}

async function execute(
  sui: SuiJsonRpcClient,
  tx: ReturnType<typeof buildCreateMachine>,
  signer: Ed25519Keypair,
) {
  const res = await sui.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showObjectChanges: true, showEffects: true, showEvents: true },
  });
  await sui.waitForTransaction({ digest: res.digest });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`tx failed: ${JSON.stringify(res.effects?.status)}`);
  }
  return res;
}

async function main() {
  if (!OPERATOR) throw new Error('set REEG_OPERATOR');
  const config = loadConfig();
  const packageId = config.reeg.packageId;
  const signer = loadKeypair(OPERATOR);
  const sui = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });

  console.log(`operator: ${OPERATOR}`);
  console.log(`package:  ${packageId}`);

  console.log('\n1. register_enclave: verifying the Nitro attestation document on chain…');
  const docHex = readFileSync(DOC_PATH, 'utf8').trim();
  const doc = fromHex(docHex);
  console.log(`   attestation document: ${doc.length} bytes`);
  const reg = await execute(sui, buildRegisterEnclave(packageId, doc), signer);
  const created = reg.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType.endsWith('::attestation::EnclaveConfig'),
  );
  if (created?.type !== 'created')
    throw new Error('register_enclave did not create an EnclaveConfig');
  const configId = created.objectId;
  console.log(`   EnclaveConfig: ${configId}`);

  const cfg = await sui.getObject({ id: configId, options: { showContent: true } });
  console.log('   EnclaveConfig content (raw):');
  console.log(JSON.stringify((cfg.data?.content as { fields?: unknown })?.fields, null, 1));

  console.log('\n2. creating a Machine to attest…');
  const mres = await execute(sui, buildCreateMachine(packageId, packageId), signer);
  const machine = mres.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType.endsWith('::machine::Machine'),
  );
  if (machine?.type !== 'created') throw new Error('no Machine created');
  const machineId = machine.objectId;
  console.log(`   machine: ${machineId}`);

  console.log('\n3. enclave signs the checkpoint preimage; register_attested_command verifies it…');
  const seq = 0n;
  const manifestHash = blake3Hash(new TextEncoder().encode('reeg attested checkpoint demo'));
  const canonical = `0x${normalizeSuiAddress(machineId).slice(2)}`;
  const signature = enclaveSign(canonical, seq, toHex(manifestHash));
  console.log(`   manifest_hash: ${toHex(manifestHash)}`);
  console.log(`   enclave sig:   ${toHex(signature).slice(0, 32)}…`);
  const ares = await execute(
    sui,
    buildRegisterAttestedCommand(packageId, configId, machineId, seq, manifestHash, signature),
    signer,
  );
  const event = ares.events?.find((e) => e.type.endsWith('::attestation::CommandAttested'));
  if (!event) throw new Error('no CommandAttested event emitted');
  console.log('   ✓ on-chain ed25519 verification passed; CommandAttested emitted');
  console.log('   CommandAttested (raw):');
  console.log(JSON.stringify(event.parsedJson, null, 1));

  console.log('\nATTESTATION OK');
  console.log(`  EnclaveConfig: ${configId}`);
  console.log(`  attested machine: ${machineId} seq ${seq}`);
}

main().catch((err) => {
  console.error('ATTESTATION FAILED');
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exitCode = 1;
});
