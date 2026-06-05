import { grant, readMachine, revoke } from '@reeg/sdk';
import { type Command, Option } from 'commander';
import { buildClients, loadKeypair } from '../lib/clients';
import { type CommonOptions, loadConfig, requireOperator } from '../lib/config';
import { parseExpiry, role, roleToRights } from '../lib/grant-options';
import { addChainOptions } from '../lib/options';

interface GrantOptions extends CommonOptions {
  role?: string;
  until?: string;
}

/** `reeg grant <machineId> <grantee>`: let another address decrypt and restore this environment.
 *  --role viewer|restore (default restore); --until <ISO 8601 | 7d | 24h | 30m> for a time limit. */
export function registerGrant(program: Command): void {
  const command = program
    .command('grant')
    .description('Grant another address access to an environment.')
    .argument('<machineId>', 'the environment id')
    .argument('<grantee>', 'the address to grant (0x...)')
    // .choices rejects a typo'd role at parse time, so a misspelling cannot silently widen rights.
    .addOption(
      new Option('--role <role>', 'viewer or restore')
        .choices(['viewer', 'restore'])
        .default('restore'),
    )
    .option('--until <when>', 'expiry: an ISO 8601 time or a duration like 7d, 24h, 30m');
  addChainOptions(command).action(
    async (machineId: string, grantee: string, options: GrantOptions) => {
      const config = loadConfig(options);
      const operator = requireOperator(config);
      const { sui } = buildClients(config);
      const signer = loadKeypair(operator);

      const policyId = await resolvePolicyId(sui, machineId);
      const { digest } = await grant(
        {
          packageId: config.packageId,
          machineId,
          policyId,
          grantee,
          rights: roleToRights(options.role),
          expiryMs: parseExpiry(options.until, Date.now()),
        },
        { sui, signer },
      );

      const expiry = options.until ? ` until ${options.until}` : '';
      console.log(`Granted ${role(options.role)} access on ${machineId} to ${grantee}${expiry}`);
      console.log(`  tx: ${digest}`);
    },
  );
}

/** `reeg revoke <machineId> <grantee>`: stop an address from decrypting future restores. */
export function registerRevoke(program: Command): void {
  addChainOptions(
    program
      .command('revoke')
      .description('Revoke an address’s access to an environment.')
      .argument('<machineId>', 'the environment id')
      .argument('<grantee>', 'the address to revoke (0x...)'),
  ).action(async (machineId: string, grantee: string, options: CommonOptions) => {
    const config = loadConfig(options);
    const operator = requireOperator(config);
    const { sui } = buildClients(config);
    const signer = loadKeypair(operator);

    const policyId = await resolvePolicyId(sui, machineId);
    const { digest } = await revoke(
      { packageId: config.packageId, machineId, policyId, grantee },
      { sui, signer },
    );

    console.log(`Revoked access on ${machineId} from ${grantee}`);
    // Be honest about the limit: revocation stops new key fetches, but every snapshot of a
    // Machine shares one key, so anyone who already fetched it keeps access to past and future
    // snapshots. True forward secrecy needs per-snapshot key rotation (not yet implemented).
    console.log('  They can no longer unlock new access. Anyone who already opened this');
    console.log('  environment may keep access to its data, including future snapshots.');
    console.log(`  tx: ${digest}`);
  });
}

// The policy id is read from the Machine on chain, so grant/revoke work without local state and
// always target the policy the Machine actually points at.
async function resolvePolicyId(
  sui: Parameters<typeof readMachine>[0],
  machineId: string,
): Promise<string> {
  const machine = await readMachine(sui, machineId);
  return machine.policyId;
}
