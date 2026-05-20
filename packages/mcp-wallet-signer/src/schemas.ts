import { z } from "zod";

// Zod schemas for MCP tool inputs
export const ConnectWalletSchema = z.object({
  chainId: z.number().optional().describe("Chain ID to connect to (default: 1 for Ethereum mainnet)"),
  address: z.string().optional().describe(
    "Required wallet address (0x...) — if specified, the user must connect this exact address",
  ),
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
  types: z.record(
    z.string(),
    z.array(z.object({
      name: z.string(),
      type: z.string(),
    })),
  ).describe("Type definitions"),
  primaryType: z.string().describe("Primary type name"),
  message: z.record(z.string(), z.unknown()).describe("Message data to sign"),
  address: z.string().optional().describe("Address to sign with"),
  chainId: z.number().optional().describe("Chain ID"),
});

export const GetBalanceSchema = z.object({
  address: z.string().describe("Address to get balance for (0x...)"),
  chainId: z.number().optional().describe("Chain ID (default: 1)"),
});

// === TRON schemas ===

const TronNetworkSchema = z.enum(["mainnet", "shasta", "nile"]);

export const TronConnectWalletSchema = z.object({
  network: TronNetworkSchema.optional().describe("Tron network (default: mainnet)"),
  address: z.string().optional().describe(
    "Required TRON Base58 address (T...) — if specified, the user must connect this exact address",
  ),
});

export const TronSendTransactionSchema = z.object({
  to: z.string().describe("Recipient TRON address (Base58, starts with T)"),
  amount: z.string().describe("Amount in SUN (1 TRX = 1,000,000 SUN); pass as a string to preserve precision"),
  from: z.string().optional().describe("Expected from-address; UI rejects if connected wallet differs"),
  data: z.string().optional().describe("Optional memo / hex data field"),
  network: TronNetworkSchema.optional().describe("Tron network (default: mainnet)"),
});

export const TronTriggerContractSchema = z.object({
  contractAddress: z.string().describe("Smart-contract address (T...)"),
  functionSelector: z.string().describe("Function signature, e.g. `transfer(address,uint256)`"),
  parameters: z.array(z.object({
    type: z.string(),
    value: z.unknown(),
  })).optional().describe("ABI-encoded parameter list — see TronWeb docs for the `parameter` array shape"),
  from: z.string().optional().describe("Expected from-address; UI rejects if connected wallet differs"),
  feeLimit: z.string().optional().describe("Max energy fee in SUN (default 150000000 = 150 TRX in the UI)"),
  callValue: z.string().optional().describe("TRX value to send with the call, in SUN"),
  network: TronNetworkSchema.optional().describe("Tron network (default: mainnet)"),
});

export const TronSignMessageSchema = z.object({
  message: z.string().describe("Message to sign"),
  address: z.string().optional().describe("Address to sign with (uses connected address if not specified)"),
  network: TronNetworkSchema.optional(),
});

export const TronSignTypedDataSchema = z.object({
  domain: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    chainId: z.string().optional(),
    verifyingContract: z.string().optional(),
    salt: z.string().optional(),
  }).describe("TIP-712 domain"),
  types: z.record(
    z.string(),
    z.array(z.object({ name: z.string(), type: z.string() })),
  ).describe("Type definitions"),
  primaryType: z.string().describe("Primary type name"),
  message: z.record(z.string(), z.unknown()).describe("Message data to sign"),
  address: z.string().optional().describe("Address to sign with"),
  network: TronNetworkSchema.optional(),
});

export const TronGetBalanceSchema = z.object({
  address: z.string().describe("TRON address to get balance for (Base58, starts with T)"),
  network: TronNetworkSchema.optional().describe("Tron network (default: mainnet)"),
});
