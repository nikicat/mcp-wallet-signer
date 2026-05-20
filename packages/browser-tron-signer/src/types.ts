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

/** Supported TRON networks. TronLink fixes its provider to one of these per session. */
export type TronNetwork = "mainnet" | "shasta" | "nile";

/** Configuration for a supported TRON network. */
export interface NetworkConfig {
  id: TronNetwork;
  name: string;
  /** TronGrid HTTP full-node URL (used for read-only balance queries via /wallet/getaccount). */
  fullHost: string;
  /** Block explorer base URL (for tx links). */
  blockExplorer?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    /** TRX uses 6 decimals — 1 TRX = 1,000,000 SUN. */
    decimals: number;
  };
}

/** Discriminator values for {@linkcode TronPendingRequest}. */
export type RequestType =
  | "connect"
  | "send_transaction"
  | "trigger_contract"
  | "deploy_contract"
  | "sign_message"
  | "sign_typed_data";

export interface ConnectRequest extends BaseRequest {
  type: "connect";
  network?: TronNetwork;
  /** Required TRON Base58Check address (T-prefixed). If set, UI rejects on mismatch. */
  address?: string;
}

/** Native TRX transfer. */
export interface SendTransactionRequest extends BaseRequest {
  type: "send_transaction";
  network?: TronNetwork;
  /** Recipient TRON address (T-prefixed Base58Check). */
  to: string;
  /** Expected `from` address. UI rejects on connected-wallet mismatch when set. */
  from?: string;
  /** Amount in SUN (1 TRX = 1,000,000 SUN) as a string to preserve precision. */
  amount: string;
  /** Optional memo / data field, hex-encoded. */
  data?: string;
}

/**
 * Smart-contract call via `tronWeb.transactionBuilder.triggerSmartContract`.
 * The browser side builds the unsigned tx with the connected wallet's tronWeb instance.
 */
export interface TriggerContractRequest extends BaseRequest {
  type: "trigger_contract";
  network?: TronNetwork;
  /** Contract address (T-prefixed). */
  contractAddress: string;
  /** Expected `from` address. UI rejects on connected-wallet mismatch when set. */
  from?: string;
  /** Function signature, e.g. `transfer(address,uint256)`. */
  functionSelector: string;
  /** Encoded ABI parameter list — see TronWeb docs for `parameter` array shape. */
  parameters?: ReadonlyArray<{ type: string; value: unknown }>;
  /** Max energy fee in SUN. Defaults to 150_000_000 (150 TRX) in the UI if omitted. */
  feeLimit?: string;
  /** TRX value to send alongside the call, in SUN. */
  callValue?: string;
}

/**
 * Smart-contract deployment via `tronWeb.transactionBuilder.createSmartContract`.
 * The browser side builds, signs, and broadcasts using the connected wallet's tronWeb instance.
 */
export interface DeployContractRequest extends BaseRequest {
  type: "deploy_contract";
  network?: TronNetwork;
  /** Expected `from` (owner) address. UI rejects on connected-wallet mismatch when set. */
  from?: string;
  /** Human-readable contract name (shown in the approval UI). */
  contractName?: string;
  /** Contract ABI — passed straight to `createSmartContract`. */
  abi: readonly unknown[];
  /** Compiled bytecode (hex, with or without `0x` prefix). */
  bytecode: string;
  /** Constructor parameters in TronWeb's `Array<{type, value}>` shape. */
  parameters?: ReadonlyArray<{ type: string; value: unknown }>;
  /** Max energy fee in SUN. Defaults to 1_500_000_000 (1500 TRX) in the UI if omitted. */
  feeLimit?: string;
  /** TRX value (in SUN) to send to the constructor. */
  callValue?: string;
  /** Origin energy limit (advanced). Defaults to 10_000_000 in the UI if omitted. */
  originEnergyLimit?: number;
  /** Percentage of fee user pays (0-100). Defaults to 100 in the UI if omitted. */
  userFeePercentage?: number;
}

export interface SignMessageRequest extends BaseRequest {
  type: "sign_message";
  network?: TronNetwork;
  message: string;
  address?: string;
}

/** TIP-712 typed-data signing. Shape mirrors EIP-712 but uses TRON-style addresses. */
export interface SignTypedDataRequest extends BaseRequest {
  type: "sign_typed_data";
  network?: TronNetwork;
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
  address?: string;
}

/** TIP-712 domain separator fields. */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  /** TRON's TIP-712 spec uses `chainId` as a 32-byte network id (hex string). */
  chainId?: string;
  verifyingContract?: string;
  salt?: string;
}

/** A single field in a TIP-712 type definition. */
export interface TypedDataField {
  name: string;
  type: string;
}

export type TronPendingRequest =
  | ConnectRequest
  | SendTransactionRequest
  | TriggerContractRequest
  | DeployContractRequest
  | SignMessageRequest
  | SignTypedDataRequest;
