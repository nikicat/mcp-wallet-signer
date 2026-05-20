import { buildConnectUrl, buildSignUrl, openBrowser, SignerErrorCode, WrongWalletAddressError } from "wallet-signer-core";
import type { RequestResult } from "wallet-signer-core";

import { getDefaultNetwork, getFullHost, getNetworkConfig, getPort, NETWORKS } from "./config.ts";
import { createHttpServer } from "./http-server.ts";
import { PendingStore } from "./pending-store.ts";
import type { TronNetwork, TypedDataDomain, TypedDataField } from "./types.ts";

/** Options for constructing a {@linkcode WalletSigner}. */
export interface WalletSignerOptions {
  port?: number;
  defaultNetwork?: TronNetwork;
  /** Control browser opening: true (default) = auto-open, false = don't open, function = custom handler. */
  openBrowser?: boolean | ((url: string) => void | Promise<void>);
}

/** Parameters for {@linkcode WalletSigner.sendTransaction}. */
export interface SendTransactionParams {
  to: string;
  /** Expected `from` address. UI rejects on connected-wallet mismatch when set. */
  from?: string;
  /** Amount in SUN (1 TRX = 1,000,000 SUN), as a string to preserve precision. */
  amount: string;
  data?: string;
  network?: TronNetwork;
}

/** Parameters for {@linkcode WalletSigner.triggerContract}. */
export interface TriggerContractParams {
  contractAddress: string;
  from?: string;
  functionSelector: string;
  parameters?: Array<{ type: string; value: unknown }>;
  feeLimit?: string;
  callValue?: string;
  network?: TronNetwork;
}

/** Parameters for {@linkcode WalletSigner.signMessage}. */
export interface SignMessageParams {
  message: string;
  address?: string;
  network?: TronNetwork;
}

/** Parameters for {@linkcode WalletSigner.signTypedData}. */
export interface SignTypedDataParams {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  primaryType: string;
  message: Record<string, unknown>;
  address?: string;
  network?: TronNetwork;
}

/** Result of {@linkcode WalletSigner.connectWallet}. */
export interface ConnectResult {
  address: string;
  approvalUrl: string;
}

/** Result of {@linkcode WalletSigner.sendTransaction} / {@linkcode WalletSigner.triggerContract}. */
export interface TransactionResult {
  txHash: string;
  approvalUrl: string;
}

/** Result of {@linkcode WalletSigner.signMessage} or {@linkcode WalletSigner.signTypedData}. */
export interface SignResult {
  signature: string;
  approvalUrl: string;
}

/** Result of {@linkcode WalletSigner.getBalance}: TRX balance in TRX and SUN. */
export interface BalanceResult {
  /** Balance in TRX, formatted with up to 6 decimals (no trailing zeros). */
  balance: string;
  /** Balance in SUN (1 TRX = 1,000,000 SUN). */
  sun: string;
  symbol: string;
}

/**
 * Programmatic interface to the TRON wallet signer. Mirrors `browser-evm-signer`'s WalletSigner
 * but targets TronLink + TRX semantics.
 */
export class WalletSigner {
  private _port: number;
  private _defaultNetwork: TronNetwork;
  private _pendingStore: PendingStore;
  private _openBrowser: (url: string) => void | Promise<void>;
  private _httpServer: { port: number; stop: () => Promise<void> } | null = null;

  constructor(options?: WalletSignerOptions) {
    this._port = options?.port ?? getPort();
    this._defaultNetwork = options?.defaultNetwork ?? getDefaultNetwork();
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

  /** The PendingStore owned by this signer. */
  get pendingStore(): PendingStore {
    return this._pendingStore;
  }

  /** The configured default network. */
  get defaultNetwork(): TronNetwork {
    return this._defaultNetwork;
  }

  /** The HTTP server port, or null if not yet started. */
  get port(): number | null {
    return this._httpServer?.port ?? null;
  }

  /** Start the HTTP server explicitly. Called automatically on first signing call. */
  async start(): Promise<number> {
    if (this._httpServer) return this._httpServer.port;
    this._httpServer = await createHttpServer(this._pendingStore, this._port);
    return this._httpServer.port;
  }

  private _unwrap(result: RequestResult): string {
    if (result.success) return result.result;
    if (result.code === SignerErrorCode.WrongWalletAddress) throw new WrongWalletAddressError(result.error);
    throw new Error(result.error);
  }

  /** Connect to TronLink and get the wallet address. Opens a browser window for user approval. */
  async connectWallet(options?: { network?: TronNetwork; address?: string }): Promise<ConnectResult> {
    const network = options?.network ?? this._defaultNetwork;
    const port = await this.start();

    const { id, promise } = this._pendingStore.createConnectRequest({ network, address: options?.address });
    const approvalUrl = buildConnectUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { address: this._unwrap(await promise), approvalUrl };
  }

  /** Send a native TRX transfer via TronLink. */
  async sendTransaction(params: SendTransactionParams): Promise<TransactionResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createSendTransactionRequest({
      ...params,
      network: params.network ?? this._defaultNetwork,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { txHash: this._unwrap(await promise), approvalUrl };
  }

  /** Trigger a smart-contract function via TronLink (TRC-20 transfers, etc.). */
  async triggerContract(params: TriggerContractParams): Promise<TransactionResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createTriggerContractRequest({
      ...params,
      network: params.network ?? this._defaultNetwork,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { txHash: this._unwrap(await promise), approvalUrl };
  }

  /** Sign an arbitrary message via `tronWeb.trx.signMessageV2`. */
  async signMessage(params: SignMessageParams): Promise<SignResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createSignMessageRequest({
      ...params,
      network: params.network ?? this._defaultNetwork,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { signature: this._unwrap(await promise), approvalUrl };
  }

  /** Sign TIP-712 typed data via `tronWeb.trx._signTypedData`. */
  async signTypedData(params: SignTypedDataParams): Promise<SignResult> {
    const port = await this.start();

    const { id, promise } = this._pendingStore.createSignTypedDataRequest({
      ...params,
      network: params.network ?? this._defaultNetwork,
    });

    const approvalUrl = buildSignUrl(port, id);
    await this._openBrowser(approvalUrl);

    return { signature: this._unwrap(await promise), approvalUrl };
  }

  /**
   * Get the native TRX balance of an address. No browser interaction — direct HTTP to TronGrid.
   *
   * TronGrid accepts either a hex address (41…) or a Base58 address; we pass `visible: true` so
   * the API accepts the Base58 form returned by TronLink.
   */
  async getBalance(params: { address: string; network?: TronNetwork }): Promise<BalanceResult> {
    const network = params.network ?? this._defaultNetwork;
    const fullHost = getFullHost(network);
    if (!fullHost) throw new Error(`Unknown TRON network: ${network}`);

    const resp = await fetch(`${fullHost}/wallet/getaccount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: params.address, visible: true }),
    });
    if (!resp.ok) throw new Error(`TronGrid getaccount failed: HTTP ${resp.status}`);

    const data = await resp.json() as { balance?: number };
    const sun = BigInt(data.balance ?? 0);

    const symbol = getNetworkConfig(network)?.nativeCurrency.symbol ?? "TRX";
    const decimals = getNetworkConfig(network)?.nativeCurrency.decimals ?? 6;

    return { balance: formatSun(sun, decimals), sun: sun.toString(), symbol };
  }

  /** Shut down the HTTP server and cancel all pending requests. */
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

/** Format a SUN bigint as TRX with up to `decimals` fractional digits, no trailing zeros. */
function formatSun(sun: bigint, decimals: number): string {
  const negative = sun < 0n;
  const abs = negative ? -sun : sun;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${body}` : body;
}

// Side-effect-free re-export so callers can reach NETWORKS without an extra import.
export { NETWORKS };
