/**
 * Root dispatcher for the per-package trigger CLIs. Picks the right chain by the first arg
 * and forwards the rest, so a single `deno task cli <chain> <subcommand> [...flags]` invocation
 * reaches the right WalletSigner.
 *
 * Usage:
 *   deno task cli evm connect --chain 1
 *   deno task cli evm send-transaction --to 0x... --value 1000000000000000000
 *   deno task cli tron connect --network shasta
 *   deno task cli tron send-trx --to T... --amount 1000000
 *
 * Each chain's CLI lives in its own package's `tools/trigger.ts`; this file just delegates.
 */

import process from "node:process";

import { runEvmTrigger } from "../packages/browser-evm-signer/tools/trigger.ts";
import { runTronTrigger } from "../packages/browser-tron-signer/tools/trigger.ts";

const USAGE = `Usage: signer-cli <chain> <subcommand> [flags]

Chains:
  evm    EVM wallets (MetaMask, Rabby, …) via EIP-6963
  tron   TronLink

Run \`signer-cli <chain> help\` for chain-specific subcommands.

Examples:
  signer-cli evm  connect --chain 1
  signer-cli evm  send-transaction --to 0xRecipient --value 1000000000000000000
  signer-cli tron connect --network mainnet
  signer-cli tron send-trx --to TRecipient --amount 1000000
  signer-cli tron trigger-contract --contract T... --selector 'transfer(address,uint256)' \\
                  --params '[{"type":"address","value":"T..."},{"type":"uint256","value":"100"}]'`;

function main(argv: string[]): Promise<void> {
  const [chain, ...rest] = argv;

  if (!chain || chain === "help" || chain === "--help" || chain === "-h") {
    console.log(USAGE);
    return Promise.resolve();
  }

  switch (chain) {
    case "evm":
      return runEvmTrigger(rest);
    case "tron":
      return runTronTrigger(rest);
    default:
      console.error(`Error: Unknown chain "${chain}"\n\n${USAGE}`);
      process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await main(Deno.args);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
