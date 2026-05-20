/**
 * Manual-trigger CLI for the TRON signer. Constructs a real `WalletSigner`, opens the browser
 * to the approval URL, prompts the user to sign in TronLink, and prints the result. Useful
 * for smoke-testing against a real wallet without spinning up the MCP loop.
 *
 * Run directly:    deno task trigger <subcommand> [...flags]
 * Or via root CLI: deno task cli tron <subcommand> [...flags]
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { readFile } from "node:fs/promises";

import open from "open";

import { WalletSigner, type WalletSignerOptions } from "../src/wallet-signer.ts";
import { getDefaultNetwork, NETWORKS } from "../src/config.ts";
import type { TronNetwork } from "../src/types.ts";

/**
 * Build a custom `openBrowser` for the WalletSigner that always prints the URL up-front and
 * then conditionally opens a browser. `--print` skips the open; `--browser <name>` routes
 * through `open({app: {name}})` so users can pick the browser TronLink is installed in.
 */
function buildOpenBrowser(values: { print?: boolean; browser?: string }): WalletSignerOptions["openBrowser"] {
  const printUrl = (url: string) => console.log(`Approval URL: ${url}`);

  if (values.print) {
    return (url) => {
      printUrl(url);
      console.log("(--print: not opening a browser; copy the URL above)");
    };
  }

  if (values.browser) {
    const name = values.browser;
    return async (url) => {
      printUrl(url);
      try {
        await open(url, { app: { name } });
      } catch (err) {
        console.error(`Failed to launch ${name}: ${err instanceof Error ? err.message : err}`);
        console.error("Open the URL above manually.");
      }
    };
  }

  return async (url) => {
    printUrl(url);
    try {
      await open(url);
    } catch (err) {
      console.error(`Failed to open browser: ${err instanceof Error ? err.message : err}`);
      console.error("Open the URL above manually.");
    }
  };
}

const BROWSER_FLAGS_USAGE = "  --browser <name>                 Override browser (chrome|firefox|edge|safari|/path)\n" +
  "  --print                          Just print the URL, don't open any browser";

const USAGE = `Usage: trigger <subcommand> [flags]

Subcommands:
  connect             Connect TronLink, print its Base58 address
  send-trx            Native TRX transfer
  trigger-contract    Call a smart contract (TRC-20 transfer, etc.)
  sign-message        signMessageV2 an arbitrary message
  sign-typed-data     TIP-712 typed-data signing (typed data via --json <file>)
  get-balance         Read the TRX balance (no browser)
  help                Show this message

Run \`trigger <subcommand> --help\` for subcommand-specific flags.`;

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function printHelp(subcommand: string, body: string): void {
  console.log(`Usage: trigger ${subcommand} [flags]\n\n${body}`);
}

function parseNetwork(s: string | undefined): TronNetwork | undefined {
  if (!s) return undefined;
  if (s !== "mainnet" && s !== "shasta" && s !== "nile") {
    die(`--network must be one of: mainnet, shasta, nile (got "${s}")`);
  }
  return s;
}

async function runConnect(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      network: { type: "string" },
      address: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "connect",
      "  --network <mainnet|shasta|nile>  Network (default: from env or mainnet)\n" +
        "  --address <T...>                 Required wallet address\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  const network = parseNetwork(values.network);
  const signer = new WalletSigner({
    defaultNetwork: network ?? getDefaultNetwork(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { address } = await signer.connectWallet({ network, address: values.address });
    console.log(`Connected:    ${address}`);
  } finally {
    await signer.shutdown();
  }
}

async function runSendTrx(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      to: { type: "string" },
      from: { type: "string" },
      amount: { type: "string" },
      data: { type: "string" },
      network: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "send-trx",
      "  --to <T...>                      Recipient address (required)\n" +
        "  --amount <sun>                   Amount in SUN (1 TRX = 1_000_000 SUN) (required)\n" +
        "  --from <T...>                    Expected from-address\n" +
        "  --data <hex>                     Optional memo/data field\n" +
        "  --network <mainnet|shasta|nile>  Network\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  if (!values.to) die("--to is required");
  if (!values.amount) die("--amount is required");

  const network = parseNetwork(values.network);
  const signer = new WalletSigner({
    defaultNetwork: network ?? getDefaultNetwork(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { txHash } = await signer.sendTransaction({
      to: values.to,
      from: values.from,
      amount: values.amount,
      data: values.data,
      network,
    });
    console.log(`Tx ID:        ${txHash}`);
    const cfg = NETWORKS[network ?? signer.defaultNetwork];
    if (cfg?.blockExplorer) console.log(`Explorer:     ${cfg.blockExplorer}/#/transaction/${txHash}`);
  } finally {
    await signer.shutdown();
  }
}

async function runTriggerContract(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      contract: { type: "string" },
      selector: { type: "string" },
      params: { type: "string" },
      from: { type: "string" },
      feeLimit: { type: "string" },
      callValue: { type: "string" },
      network: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "trigger-contract",
      "  --contract <T...>                Smart-contract address (required)\n" +
        "  --selector <sig>                 Function signature, e.g. 'transfer(address,uint256)' (required)\n" +
        '  --params <json>                  Parameters as JSON array: \'[{"type":"address","value":"T..."}, ...]\'\n' +
        "  --from <T...>                    Expected from-address\n" +
        "  --feeLimit <sun>                 Max energy fee in SUN\n" +
        "  --callValue <sun>                TRX to send with the call, in SUN\n" +
        "  --network <mainnet|shasta|nile>  Network\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  if (!values.contract) die("--contract is required");
  if (!values.selector) die("--selector is required");

  const parameters = values.params ? (JSON.parse(values.params) as Array<{ type: string; value: unknown }>) : undefined;

  const network = parseNetwork(values.network);
  const signer = new WalletSigner({
    defaultNetwork: network ?? getDefaultNetwork(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { txHash } = await signer.triggerContract({
      contractAddress: values.contract,
      functionSelector: values.selector,
      parameters,
      from: values.from,
      feeLimit: values.feeLimit,
      callValue: values.callValue,
      network,
    });
    console.log(`Tx ID:        ${txHash}`);
    const cfg = NETWORKS[network ?? signer.defaultNetwork];
    if (cfg?.blockExplorer) console.log(`Explorer:     ${cfg.blockExplorer}/#/transaction/${txHash}`);
  } finally {
    await signer.shutdown();
  }
}

async function runSignMessage(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      message: { type: "string" },
      address: { type: "string" },
      network: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "sign-message",
      "  --message <str>                  Message to sign (required)\n" +
        "  --address <T...>                 Address to sign with\n" +
        "  --network <mainnet|shasta|nile>  Network\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  if (!values.message) die("--message is required");

  const network = parseNetwork(values.network);
  const signer = new WalletSigner({
    defaultNetwork: network ?? getDefaultNetwork(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { signature } = await signer.signMessage({
      message: values.message,
      address: values.address,
      network,
    });
    console.log(`Signature:    ${signature}`);
  } finally {
    await signer.shutdown();
  }
}

async function runSignTypedData(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      json: { type: "string" },
      address: { type: "string" },
      network: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "sign-typed-data",
      "  --json <file>                    Path to JSON with {domain, types, primaryType, message} (required)\n" +
        "  --address <T...>                 Address to sign with\n" +
        "  --network <mainnet|shasta|nile>  Network\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  if (!values.json) die("--json <file> is required");
  const raw = await readFile(values.json, "utf-8");
  const parsed = JSON.parse(raw) as {
    domain: Parameters<WalletSigner["signTypedData"]>[0]["domain"];
    types: Parameters<WalletSigner["signTypedData"]>[0]["types"];
    primaryType: string;
    message: Record<string, unknown>;
  };

  const network = parseNetwork(values.network);
  const signer = new WalletSigner({
    defaultNetwork: network ?? getDefaultNetwork(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { signature } = await signer.signTypedData({
      ...parsed,
      address: values.address,
      network,
    });
    console.log(`Signature:    ${signature}`);
  } finally {
    await signer.shutdown();
  }
}

async function runGetBalance(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      address: { type: "string" },
      network: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "get-balance",
      "  --address <T...>                 Address to query (required)\n" +
        "  --network <mainnet|shasta|nile>  Network",
    );
    return;
  }

  if (!values.address) die("--address is required");

  const network = parseNetwork(values.network);
  const signer = new WalletSigner({ defaultNetwork: network ?? getDefaultNetwork(), openBrowser: false });
  const { balance, sun, symbol } = await signer.getBalance({ address: values.address, network });
  console.log(`Balance: ${balance} ${symbol}`);
  console.log(`Sun:     ${sun}`);
}

/**
 * Run the TRON trigger CLI. Exported for use by the root dispatcher.
 */
export function runTronTrigger(argv: string[]): Promise<void> {
  const [subcommand, ...rest] = argv;

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log(USAGE);
    return Promise.resolve();
  }

  switch (subcommand) {
    case "connect":
      return runConnect(rest);
    case "send-trx":
    case "send-transaction":
      return runSendTrx(rest);
    case "trigger-contract":
      return runTriggerContract(rest);
    case "sign-message":
      return runSignMessage(rest);
    case "sign-typed-data":
      return runSignTypedData(rest);
    case "get-balance":
      return runGetBalance(rest);
    default:
      die(`Unknown subcommand: ${subcommand}\n\n${USAGE}`);
  }
}

if (import.meta.main) {
  try {
    await runTronTrigger(Deno.args);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
