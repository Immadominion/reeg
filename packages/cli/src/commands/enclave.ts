import { fromHex } from '@mysten/sui/utils';
import { buildRegisterEnclave } from '@reeg/chain';
import type { Command } from 'commander';
import { buildClients, loadKeypair } from '../lib/clients';
import { type CommonOptions, loadConfig, requireOperator } from '../lib/config';
import { engineAttestDoc } from '../lib/engine';
import { addChainOptions } from '../lib/options';

interface EnclaveOptions extends CommonOptions {
  cid?: string;
  port?: string;
}

/** `reeg enclave register`: fetch the local Nitro enclave's attestation document over vsock, verify
 *  it on chain via 0x2::nitro_attestation, and pin its PCRs + ed25519 key into a shared
 *  EnclaveConfig. Run once per enclave build; pass the printed id to `reeg checkpoint --attest`. */
export function registerEnclave(program: Command): void {
  const enclave = program
    .command('enclave')
    .description('Nautilus attestation enclave operations (optional "prove which code ran" tier).');
  addChainOptions(
    enclave
      .command('register')
      .description(
        'Register the local enclave on chain (verify its Nitro attestation, pin its PCRs).',
      )
      .option('--cid <n>', 'enclave vsock CID', '16')
      .option('--port <n>', 'enclave vsock port', '5005'),
  ).action(async (options: EnclaveOptions) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const { sui } = buildClients(config);
    const cid = Number(options.cid ?? process.env.REEG_ENCLAVE_CID ?? '16');
    const port = Number(options.port ?? process.env.REEG_ENCLAVE_PORT ?? '5005');

    const documentHex = await engineAttestDoc(config.engineBin, cid, port);
    const signer = loadKeypair(operator);
    const res = await sui.signAndExecuteTransaction({
      transaction: buildRegisterEnclave(config.packageId, fromHex(documentHex)),
      signer,
      options: { showObjectChanges: true, showEffects: true },
    });
    await sui.waitForTransaction({ digest: res.digest });
    if (res.effects?.status.status !== 'success') {
      console.error(`error: register_enclave failed: ${JSON.stringify(res.effects?.status)}`);
      process.exitCode = 1;
      return;
    }
    const created = res.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType.endsWith('::attestation::EnclaveConfig'),
    );
    if (created?.type !== 'created') {
      console.error('error: register_enclave did not create an EnclaveConfig');
      process.exitCode = 1;
      return;
    }
    console.log('Enclave registered');
    console.log(`  EnclaveConfig: ${created.objectId}`);
    console.log(`  tx:            ${res.digest}`);
    console.log(
      `  attest with:   reeg checkpoint <machine> --attest --enclave-config ${created.objectId}`,
    );
  });
}
