/** Public types of the pre-0.3.1 API that outlive the old HTTP bridge. */

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
