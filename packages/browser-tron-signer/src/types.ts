/** Public types of the pre-0.3.1 API that outlive the old HTTP bridge. */

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
