/**
 * Manual-trigger CLI for the EVM signer. Constructs a real `WalletSigner`, opens the browser
 * to the approval URL, prompts the user to sign in MetaMask / Rabby / etc., and prints the
 * result. Useful for smoke-testing against a real wallet without spinning up the MCP loop.
 *
 * Run directly:    deno task trigger <subcommand> [...flags]
 * Or via root CLI: deno task cli evm <subcommand> [...flags]
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { readFile } from "node:fs/promises";

import open from "open";

import { WalletSigner, type WalletSignerOptions } from "../src/wallet-signer.ts";
import { CHAINS, getDefaultChainId } from "../src/config.ts";

/**
 * Build a custom `openBrowser` for the WalletSigner that always prints the URL up-front and
 * then conditionally opens a browser. `--print` skips the open; `--browser <name>` routes
 * through `open({app: {name}})` so users can pick the browser TronLink/MetaMask is installed in.
 *
 * `name` accepts the cross-platform aliases the `open` package recognises (chrome, firefox, edge,
 * safari) or an absolute path to a browser binary.
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

const BROWSER_FLAGS_USAGE = "  --browser <name>             Override browser (chrome|firefox|edge|safari|/path)\n" +
  "  --print                      Just print the URL, don't open any browser";

const USAGE = `Usage: trigger <subcommand> [flags]

Subcommands:
  connect             Connect a wallet, print its address
  send-transaction    Send ETH or call a contract
  sign-message        personal_sign an arbitrary message
  sign-typed-data     EIP-712 typed-data signing (typed data via --json <file>)
  get-balance         Read the native balance (no browser)
  help                Show this message

Run \`trigger <subcommand> --help\` for subcommand-specific flags.`;

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function printHelp(subcommand: string, body: string): void {
  console.log(`Usage: trigger ${subcommand} [flags]\n\n${body}`);
}

async function runConnect(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      chain: { type: "string" },
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
      "  --chain <id>                 Chain ID (default from env or 1)\n" +
        "  --address <0x...>            Required wallet address\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  const chainId = values.chain ? parseInt(values.chain, 10) : undefined;
  const signer = new WalletSigner({
    defaultChainId: chainId ?? getDefaultChainId(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { address } = await signer.connectWallet({ chainId, address: values.address });
    console.log(`Connected:    ${address}`);
  } finally {
    await signer.shutdown();
  }
}

async function runSendTransaction(rest: string[]): Promise<void> {
  const { values } = parseArgs({
    args: rest,
    options: {
      to: { type: "string" },
      from: { type: "string" },
      value: { type: "string" },
      data: { type: "string" },
      chain: { type: "string" },
      gasLimit: { type: "string" },
      maxFeePerGas: { type: "string" },
      maxPriorityFeePerGas: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "send-transaction",
      "  --to <0x...>                 Recipient address (required)\n" +
        "  --value <wei>                Amount in wei\n" +
        "  --data <hex>                 Contract calldata (optional)\n" +
        "  --from <0x...>               Expected from-address (UI rejects on mismatch)\n" +
        "  --chain <id>                 Chain ID\n" +
        "  --gasLimit <n>               Gas limit\n" +
        "  --maxFeePerGas <wei>         EIP-1559 max fee\n" +
        "  --maxPriorityFeePerGas <wei> EIP-1559 priority fee\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  if (!values.to) die("--to is required");

  const chainId = values.chain ? parseInt(values.chain, 10) : undefined;
  const signer = new WalletSigner({
    defaultChainId: chainId ?? getDefaultChainId(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { txHash } = await signer.sendTransaction({
      to: values.to,
      from: values.from,
      value: values.value,
      data: values.data,
      chainId,
      gasLimit: values.gasLimit,
      maxFeePerGas: values.maxFeePerGas,
      maxPriorityFeePerGas: values.maxPriorityFeePerGas,
    });
    console.log(`Tx hash:      ${txHash}`);
    const chain = CHAINS[chainId ?? signer.defaultChainId];
    if (chain?.blockExplorer) console.log(`Explorer:     ${chain.blockExplorer}/tx/${txHash}`);
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
      chain: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "sign-message",
      "  --message <str>              Message to sign (required)\n" +
        "  --address <0x...>            Address to sign with (defaults to connected)\n" +
        "  --chain <id>                 Chain ID\n" +
        BROWSER_FLAGS_USAGE,
    );
    return;
  }

  if (!values.message) die("--message is required");

  const chainId = values.chain ? parseInt(values.chain, 10) : undefined;
  const signer = new WalletSigner({
    defaultChainId: chainId ?? getDefaultChainId(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { signature } = await signer.signMessage({
      message: values.message,
      address: values.address,
      chainId,
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
      chain: { type: "string" },
      browser: { type: "string" },
      print: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp(
      "sign-typed-data",
      "  --json <file>                Path to JSON with {domain, types, primaryType, message} (required)\n" +
        "  --address <0x...>            Address to sign with\n" +
        "  --chain <id>                 Chain ID\n" +
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

  const chainId = values.chain ? parseInt(values.chain, 10) : undefined;
  const signer = new WalletSigner({
    defaultChainId: chainId ?? getDefaultChainId(),
    openBrowser: buildOpenBrowser(values),
  });
  try {
    const { signature } = await signer.signTypedData({
      ...parsed,
      address: values.address,
      chainId,
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
      chain: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp("get-balance", "  --address <0x...>  Address to query (required)\n  --chain <id>       Chain ID");
    return;
  }

  if (!values.address) die("--address is required");

  const chainId = values.chain ? parseInt(values.chain, 10) : undefined;
  const signer = new WalletSigner({ defaultChainId: chainId ?? getDefaultChainId(), openBrowser: false });
  const { balance, wei, symbol } = await signer.getBalance({ address: values.address, chainId });
  console.log(`Balance: ${balance} ${symbol}`);
  console.log(`Wei:     ${wei}`);
}

/**
 * Run the EVM trigger CLI. Exported for use by the root dispatcher.
 */
export function runEvmTrigger(argv: string[]): Promise<void> {
  const [subcommand, ...rest] = argv;

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log(USAGE);
    return Promise.resolve();
  }

  switch (subcommand) {
    case "connect":
      return runConnect(rest);
    case "send-transaction":
      return runSendTransaction(rest);
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
    await runEvmTrigger(Deno.args);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
