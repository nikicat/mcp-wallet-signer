#!/usr/bin/env node
/**
 * MCP shim over `browser-web3-signer`.
 *
 * The signing, the bridge and the browser tab all live in browser-web3-signer; this file is
 * only the MCP stdio surface around its `WalletSignerClient`. Kept for MCP clients that already
 * point at `npx mcp-wallet-signer` — new setups should use the `browser-web3-signer` CLI.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WalletSignerClient } from "browser-web3-signer";
import { z } from "zod";

const defaultChainId = Number(process.env.EVM_MCP_DEFAULT_CHAIN) || undefined;
const client = new WalletSignerClient("evm", { defaultChainId });

const chainId = z.number().int().optional().describe("EVM chain id (default: 1)");
const address = z.string().optional().describe("Require this account to be the signer (0x…)");
const text = (value) => ({ content: [{ type: "text", text: value }] });

const server = new McpServer({ name: "mcp-wallet-signer", version: "0.7.0" });

server.registerTool(
  "connect_wallet",
  {
    title: "Connect wallet",
    description: "Open the approval page and connect a browser wallet. Returns the address.",
    inputSchema: { chainId, address },
  },
  async (args) => text(await client.connectWallet(args)),
);

server.registerTool(
  "send_transaction",
  {
    title: "Send transaction",
    description:
      "Ask the user to approve and send a transaction from their browser wallet. Returns the tx hash.",
    inputSchema: {
      to: z.string().describe("Recipient or contract address (0x…)"),
      value: z.string().optional().describe("Amount in wei, as a decimal string"),
      data: z.string().optional().describe("Calldata (0x…) for a contract call"),
      gasLimit: z.string().optional(),
      maxFeePerGas: z.string().optional().describe("In wei, as a decimal string"),
      maxPriorityFeePerGas: z.string().optional().describe("In wei, as a decimal string"),
      from: address,
      chainId,
    },
  },
  async (args) => text(await client.sendTransaction(args)),
);

server.registerTool(
  "sign_message",
  {
    title: "Sign message",
    description: "Sign a plain message with `personal_sign`. Returns the signature.",
    inputSchema: { message: z.string(), address, chainId },
  },
  async (args) => text(await client.signMessage(args)),
);

server.registerTool(
  "sign_typed_data",
  {
    title: "Sign typed data",
    description: "Sign EIP-712 typed data. Returns the signature.",
    inputSchema: {
      domain: z.record(z.string(), z.unknown()),
      types: z.record(z.string(), z.unknown()),
      primaryType: z.string(),
      message: z.record(z.string(), z.unknown()),
      address,
      chainId,
    },
  },
  async (args) => text(await client.signTypedData(args)),
);

await server.connect(new StdioServerTransport());
