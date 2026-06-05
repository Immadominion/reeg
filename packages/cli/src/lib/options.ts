import type { Command } from 'commander';

/** Options every chain-touching command shares: network, RPC override, package, operator. */
export function addChainOptions(command: Command): Command {
  return command
    .option('-n, --network <network>', 'sui network', process.env.REEG_NETWORK ?? 'testnet')
    .option('--rpc <url>', 'override the Sui RPC URL')
    .option('--package <id>', 'the Reeg Move package id', process.env.REEG_PACKAGE_ID)
    .option('--operator <address>', 'operator address that signs', process.env.REEG_OPERATOR);
}
