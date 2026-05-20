import type { BaseRequest } from "wallet-signer-core";

// Re-export the shared transport-layer types so existing consumers (and intra-package imports)
// continue to find them at this path.
export type {
  CompleteApiRequest,
  ErrorResult,
  PendingApiResponse,
  PendingEntry,
  RequestResult,
  SuccessResult,
} from "wallet-signer-core";

/** Configuration for a supported EVM chain (name, RPC URL, native currency, etc.). */
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

/** Discriminator values for {@linkcode PendingRequest}. */
export type RequestType = "connect" | "send_transaction" | "sign_message" | "sign_typed_data";

export interface ConnectRequest extends BaseRequest {
  type: "connect";
  chainId?: number;
  address?: string;
}

export interface SendTransactionRequest extends BaseRequest {
  type: "send_transaction";
  chainId?: number;
  to: string;
  /** Expected `from` address. When set, the browser UI refuses to sign unless the connected wallet matches. */
  from?: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface SignMessageRequest extends BaseRequest {
  type: "sign_message";
  chainId?: number;
  message: string;
  address?: string;
}

export interface SignTypedDataRequest extends BaseRequest {
  type: "sign_typed_data";
  chainId?: number;
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
  address?: string;
}

/** EIP-712 domain separator fields. */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

/** A single field in an EIP-712 type definition. */
export interface TypedDataField {
  name: string;
  type: string;
}

export type PendingRequest =
  | ConnectRequest
  | SendTransactionRequest
  | SignMessageRequest
  | SignTypedDataRequest;
