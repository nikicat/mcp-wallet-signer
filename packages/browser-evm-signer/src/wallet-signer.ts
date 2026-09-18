/**
 * The pre-0.3.1 `WalletSigner` surface, re-backed by the Rust bridge.
 *
 * Signing calls go through `browser-web3-signer serve`; the balance reads never touched the
 * wallet and are unchanged, straight viem RPC calls.
 */

import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from "viem";

import { Bridge, type OpenBrowser } from "./bridge.ts";
import { CHAINS, getDefaultChainId, getRpcUrl } from "./config.ts";
import type { TypedDataDomain, TypedDataField } from "./types.ts";

/** Options for constructing a {@linkcode WalletSigner}. */
export interface WalletSignerOptions {
  /**
   * Ignored since 0.3.1 — the Rust bridge binds its own free port. Accepted so existing
   * construction sites keep type-checking.
   */
  port?: number;
  defaultChainId?: number;
  /** Control browser opening: true (default) = auto-open, false = don't open, function = custom handler */
  openBrowser?: OpenBrowser;
}

/** Parameters for {@linkcode WalletSigner.sendTransaction}. */
export interface SendTransactionParams {
  to: string;
  /** Expected `from` address. When set, the browser UI refuses to sign unless the connected wallet matches. */
  from?: string;
  value?: string;
  data?: string;
  chainId?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/** Parameters for {@linkcode WalletSigner.signMessage}. */
export interface SignMessageParams {
  message: string;
  address?: string;
  chainId?: number;
}

/** Parameters for {@linkcode WalletSigner.signTypedData}. */
export interface SignTypedDataParams {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
  address?: string;
  chainId?: number;
}

/**
 * Result of {@linkcode WalletSigner.connectWallet}: the connected address and the approval URL.
 *
 * Since 0.3.1 `approvalUrl` is the bridge's base URL — the bridge opens the approval page itself
 * and does not hand the per-request URL back.
 */
export interface ConnectResult {
  address: string;
  approvalUrl: string;
}

/** Result of {@linkcode WalletSigner.sendTransaction}: the transaction hash and the approval URL. */
export interface TransactionResult {
  txHash: string;
  approvalUrl: string;
}

/** Result of {@linkcode WalletSigner.signMessage} or {@linkcode WalletSigner.signTypedData}. */
export interface SignResult {
  signature: string;
  approvalUrl: string;
}

/** Result of {@linkcode WalletSigner.getBalance}: native token balance in both human-readable and wei formats. */
export interface BalanceResult {
  balance: string;
  wei: string;
  symbol: string;
}

/** Result of {@linkcode WalletSigner.getTokenBalance}: ERC-20 balance formatted and raw, plus token metadata. */
export interface TokenBalanceResult {
  /** Human-readable balance, divided by `10 ** decimals`. */
  balance: string;
  /** Raw `balanceOf` return value as a decimal string (uint256). */
  raw: string;
  /** Token symbol as reported by the contract. `""` if the call reverted. */
  symbol: string;
  /** Token decimals as reported by the contract. */
  decimals: number;
}

/**
 * Programmatic interface to the wallet signer. Each instance owns one `serve` subprocess, which
 * in turn owns the bridge and the browser tab.
 */
export class WalletSigner {
  readonly #bridge: Bridge;
  readonly #defaultChainId: number;

  constructor(options?: WalletSignerOptions) {
    this.#bridge = new Bridge("evm", options?.openBrowser ?? true);
    this.#defaultChainId = options?.defaultChainId ?? getDefaultChainId();
  }

  /** The configured default chain ID */
  get defaultChainId(): number {
    return this.#defaultChainId;
  }

  /** The bridge port, or null if not yet started */
  get port(): number | null {
    return this.#bridge.port;
  }

  /**
   * Start the bridge explicitly. Called automatically on first signing call.
   * Returns the port it is listening on.
   */
  start(): Promise<number> {
    return this.#bridge.start();
  }

  /**
   * Connect to a browser wallet and get the wallet address.
   * Opens a browser window for user approval.
   */
  async connectWallet(options?: { chainId?: number; address?: string }): Promise<ConnectResult> {
    const { result, approvalUrl } = await this.#bridge.request({
      type: "connect",
      chainId: options?.chainId ?? this.#defaultChainId,
      address: options?.address,
    });
    return { address: result, approvalUrl };
  }

  /**
   * Send a transaction via the connected browser wallet.
   * Opens a browser window for user approval.
   */
  async sendTransaction(params: SendTransactionParams): Promise<TransactionResult> {
    const { result, approvalUrl } = await this.#bridge.request({
      type: "send_transaction",
      ...params,
      chainId: params.chainId ?? this.#defaultChainId,
    });
    return { txHash: result, approvalUrl };
  }

  /**
   * Sign a message using personal_sign.
   * Opens a browser window for user approval.
   */
  async signMessage(params: SignMessageParams): Promise<SignResult> {
    const { result, approvalUrl } = await this.#bridge.request({
      type: "sign_message",
      ...params,
      chainId: params.chainId ?? this.#defaultChainId,
    });
    return { signature: result, approvalUrl };
  }

  /**
   * Sign EIP-712 typed data.
   * Opens a browser window for user approval.
   */
  async signTypedData(params: SignTypedDataParams): Promise<SignResult> {
    const { result, approvalUrl } = await this.#bridge.request({
      type: "sign_typed_data",
      ...params,
      chainId: params.chainId ?? this.#defaultChainId,
    });
    return { signature: result, approvalUrl };
  }

  /**
   * Get the native token balance of an address.
   * Does not require browser interaction — reads directly from the blockchain.
   */
  async getBalance(params: { address: string; chainId?: number }): Promise<BalanceResult> {
    const chainId = params.chainId ?? this.#defaultChainId;
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) throw new Error(`Unknown chain ID: ${chainId}. No RPC URL configured.`);

    const client = createPublicClient({ transport: http(rpcUrl) });
    const balance = await client.getBalance({ address: params.address as `0x${string}` });

    return {
      balance: formatEther(balance),
      wei: balance.toString(),
      symbol: CHAINS[chainId]?.nativeCurrency.symbol || "ETH",
    };
  }

  /**
   * Get the ERC-20 token balance of an address. Reads `balanceOf`, `decimals`, and `symbol`
   * from the contract — no browser interaction. `symbol` falls back to `""` if the token does
   * not implement it (some non-standard contracts revert the call).
   */
  async getTokenBalance(params: {
    contractAddress: string;
    address: string;
    chainId?: number;
  }): Promise<TokenBalanceResult> {
    const chainId = params.chainId ?? this.#defaultChainId;
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) throw new Error(`Unknown chain ID: ${chainId}. No RPC URL configured.`);

    const client = createPublicClient({ transport: http(rpcUrl) });
    const contract = { address: params.contractAddress as `0x${string}`, abi: erc20Abi } as const;

    const [raw, decimals, symbol] = await Promise.all([
      client.readContract({ ...contract, functionName: "balanceOf", args: [params.address as `0x${string}`] }),
      client.readContract({ ...contract, functionName: "decimals" }),
      client.readContract({ ...contract, functionName: "symbol" }).catch(() => ""),
    ]);

    return {
      balance: formatUnits(raw, decimals),
      raw: raw.toString(),
      symbol,
      decimals,
    };
  }

  /** Shut down the bridge subprocess. */
  async shutdown(): Promise<void> {
    await this.#bridge.stop();
  }
}
