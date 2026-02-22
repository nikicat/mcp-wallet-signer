import { z } from "zod";

// Zod schemas for MCP tool inputs
export const ConnectWalletSchema = z.object({
  chainId: z.number().optional().describe("Chain ID to connect to (default: 1 for Ethereum mainnet)"),
});

export const SendTransactionSchema = z.object({
  to: z.string().describe("Recipient address (0x...)"),
  value: z.string().optional().describe("Amount in wei to send"),
  data: z.string().optional().describe("Contract call data (hex encoded)"),
  chainId: z.number().optional().describe("Chain ID (default: 1)"),
  gasLimit: z.string().optional().describe("Gas limit"),
  maxFeePerGas: z.string().optional().describe("Max fee per gas in wei"),
  maxPriorityFeePerGas: z.string().optional().describe("Max priority fee per gas in wei"),
});

export const SignMessageSchema = z.object({
  message: z.string().describe("Message to sign"),
  address: z.string().optional().describe("Address to sign with (uses connected address if not specified)"),
  chainId: z.number().optional().describe("Chain ID"),
});

export const SignTypedDataSchema = z.object({
  domain: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    chainId: z.number().optional(),
    verifyingContract: z.string().optional(),
    salt: z.string().optional(),
  }).describe("EIP-712 domain"),
  types: z.record(z.string(), z.array(z.object({
    name: z.string(),
    type: z.string(),
  }))).describe("Type definitions"),
  primaryType: z.string().describe("Primary type name"),
  message: z.record(z.string(), z.unknown()).describe("Message data to sign"),
  address: z.string().optional().describe("Address to sign with"),
  chainId: z.number().optional().describe("Chain ID"),
});

export const GetBalanceSchema = z.object({
  address: z.string().describe("Address to get balance for (0x...)"),
  chainId: z.number().optional().describe("Chain ID (default: 1)"),
});
