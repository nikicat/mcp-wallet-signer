import { z } from "zod";

// Chain configuration
export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer?: string;
}

// Request types for pending store
export type RequestType = "connect" | "send_transaction" | "sign_message" | "sign_typed_data";

export interface BaseRequest {
  id: string;
  type: RequestType;
  chainId?: number;
  createdAt: number;
}

export interface ConnectRequest extends BaseRequest {
  type: "connect";
}

export interface SendTransactionRequest extends BaseRequest {
  type: "send_transaction";
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface SignMessageRequest extends BaseRequest {
  type: "sign_message";
  message: string;
  address?: string;
}

export interface SignTypedDataRequest extends BaseRequest {
  type: "sign_typed_data";
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
  address?: string;
}

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

export interface TypedDataField {
  name: string;
  type: string;
}

export type PendingRequest =
  | ConnectRequest
  | SendTransactionRequest
  | SignMessageRequest
  | SignTypedDataRequest;

// Response types
export interface SuccessResult {
  success: true;
  result: string; // address, tx hash, or signature
}

export interface ErrorResult {
  success: false;
  error: string;
}

export type RequestResult = SuccessResult | ErrorResult;

// Pending store entry
export interface PendingEntry<T extends PendingRequest = PendingRequest> {
  request: T;
  resolve: (result: RequestResult) => void;
  reject: (error: Error) => void;
}

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
  types: z.record(z.array(z.object({
    name: z.string(),
    type: z.string(),
  }))).describe("Type definitions"),
  primaryType: z.string().describe("Primary type name"),
  message: z.record(z.unknown()).describe("Message data to sign"),
  address: z.string().optional().describe("Address to sign with"),
  chainId: z.number().optional().describe("Chain ID"),
});

export const GetBalanceSchema = z.object({
  address: z.string().describe("Address to get balance for (0x...)"),
  chainId: z.number().optional().describe("Chain ID (default: 1)"),
});

// HTTP API types
export interface PendingApiResponse {
  request: PendingRequest;
}

export interface CompleteApiRequest {
  success: boolean;
  result?: string;
  error?: string;
}
