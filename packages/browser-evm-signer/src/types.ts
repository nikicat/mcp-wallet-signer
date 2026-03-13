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
  address?: string;
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

// HTTP API types
export interface PendingApiResponse {
  request: PendingRequest;
}

export interface CompleteApiRequest {
  success: boolean;
  result?: string;
  error?: string;
}
