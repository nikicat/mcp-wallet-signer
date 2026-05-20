import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from "viem";

import { PendingStore } from "./pending-store.ts";
import { createHttpServer } from "./http-server.ts";
import { buildConnectUrl, buildSignUrl, openBrowser } from "./browser.ts";
import { CHAINS, getDefaultChainId, getPort, getRpcUrl } from "./config.ts";
import { SignerErrorCode, WrongWalletAddressError } from "./errors.ts";
import type { RequestResult, TypedDataDomain, TypedDataField } from "./types.ts";

/** Options for constructing a {@linkcode WalletSigner}. */
export interface WalletSignerOptions {
  port?: number;
  defaultChainId?: number;
  /** Control browser opening: true (default) = auto-open, false = don't open, function = custom handler */
  openBrowser?: boolean | ((url: string) => void | Promise<void>);
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

/** Result of {@linkcode WalletSigner.connectWallet}: the connected address and the approval URL. */
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
 * Programmatic interface to the wallet signer.
 * Each instance owns its own PendingStore and HTTP server.
 */
export class WalletSigner {
  private _port: number;
  private _defaultChainId: number;
  private _pendingStore: PendingStore;
  private _openBrowser: (url: string) => void | Promise<void>;
  private _httpServer: { port: number; stop: () => Promise<void> } | null = null;

  constructor(options?: WalletSignerOptions) {
    this._port = options?.port ?? getPort();
    this._defaultChainId = options?.defaultChainId ?? getDefaultChainId();
    this._pendingStore = new PendingStore();

    const ob = options?.openBrowser ?? true;
    if (typeof ob === "function") {
      this._openBrowser = ob;
    } else if (ob) {
      this._openBrowser = openBrowser;
    } else {
      this._openBrowser = () => {};
    }
  }

  /** The PendingStore owned by this signer */
  get pendingStore(): PendingStore {
    return this._pendingStore;
  }

  /** Unwrap a pending-store result, mapping discriminating error codes to typed exceptions. */
  private _unwrap(result: RequestResult): string {
    if (result.success) return result.result;
    if (result.code === SignerErrorCode.WrongWalletAddress) throw new WrongWalletAddressError(result.error);
    throw new Error(result.error);
  }

  /** The configured default chain ID */
  get defaultChainId(): number {
    return this._defaultChainId;
  }

  /** The HTTP server port, or null if not yet started */
  get port(): number | null {
    return this._httpServer?.port ?? null;
  }

  /**
   * Start the HTTP server explicitly. Called automatically on first signing call.
   * Returns the port the server is listening on.
   */
  async start(): Promise<number> {
    if (this._httpServer) {
      return this._httpServer.port;
    }
    this._httpServer = await createHttpServer(this._pendingStore, this._port);
    return this._httpServer.port;
  }

  /**
   * Connect to a browser wallet and get the wallet address.
   * Opens a browser window for user approval.
   */
  async connectWallet(options?: { chainId?: number; address?: string }): Promise<ConnectResult> {
    const chainId = options?.chainId ?? this._defaultChainId;
    const port = await this.start();

    const { id, promise } = this._pendingStore.createConnectRequest({ chainId, address: options?.address });
    const approvalUrl = buildConnectUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { address: this._unwrap(await promise), approvalUrl };
  }

  /**
   * Send a transaction via the connected browser wallet.
   * Opens a browser window for user approval.
   */
  async sendTransaction(params: SendTransactionParams): Promise<TransactionResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createSendTransactionRequest({
      ...params,
      chainId: params.chainId ?? this._defaultChainId,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { txHash: this._unwrap(await promise), approvalUrl };
  }

  /**
   * Sign a message using personal_sign.
   * Opens a browser window for user approval.
   */
  async signMessage(params: SignMessageParams): Promise<SignResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createSignMessageRequest({
      ...params,
      chainId: params.chainId ?? this._defaultChainId,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { signature: this._unwrap(await promise), approvalUrl };
  }

  /**
   * Sign EIP-712 typed data.
   * Opens a browser window for user approval.
   */
  async signTypedData(params: SignTypedDataParams): Promise<SignResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createSignTypedDataRequest({
      ...params,
      chainId: params.chainId ?? this._defaultChainId,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { signature: this._unwrap(await promise), approvalUrl };
  }

  /**
   * Get the native token balance of an address.
   * Does not require browser interaction — reads directly from the blockchain.
   */
  async getBalance(params: { address: string; chainId?: number }): Promise<BalanceResult> {
    const chainId = params.chainId ?? this._defaultChainId;
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) throw new Error(`Unknown chain ID: ${chainId}. No RPC URL configured.`);

    const client = createPublicClient({ transport: http(rpcUrl) });
    const balance = await client.getBalance({
      address: params.address as `0x${string}`,
    });

    const chain = CHAINS[chainId];
    const symbol = chain?.nativeCurrency.symbol || "ETH";

    return {
      balance: formatEther(balance),
      wei: balance.toString(),
      symbol,
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
    const chainId = params.chainId ?? this._defaultChainId;
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

  /**
   * Shut down the HTTP server and cancel all pending requests.
   */
  async shutdown(): Promise<void> {
    if (this._httpServer) {
      await this._httpServer.stop();
      this._httpServer = null;
    }
    for (const id of this._pendingStore.getPendingIds()) {
      this._pendingStore.cancel(id, "Wallet signer shutting down");
    }
  }
}
