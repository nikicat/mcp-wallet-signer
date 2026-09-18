/**
 * The pre-0.3.1 `WalletSigner` surface, re-backed by the Rust bridge.
 *
 * Signing calls go through `browser-web3-signer serve --chain tron`; the balance reads never
 * touched the wallet and are unchanged, straight TronGrid HTTP calls.
 */

import { base58 } from "@scure/base";

import { Bridge, type OpenBrowser } from "./bridge.ts";
import { getDefaultNetwork, getFullHost, getNetworkConfig, NETWORKS } from "./config.ts";
import type { TronNetwork, TypedDataDomain, TypedDataField } from "./types.ts";

/** Options for constructing a {@linkcode WalletSigner}. */
export interface WalletSignerOptions {
  /**
   * Ignored since 0.3.1 — the Rust bridge binds its own free port. Accepted so existing
   * construction sites keep type-checking.
   */
  port?: number;
  defaultNetwork?: TronNetwork;
  /** Control browser opening: true (default) = auto-open, false = don't open, function = custom handler. */
  openBrowser?: OpenBrowser;
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
  parameters?: ReadonlyArray<{ type: string; value: unknown }>;
  feeLimit?: string;
  callValue?: string;
  network?: TronNetwork;
}

/** Parameters for {@linkcode WalletSigner.deployContract}. */
export interface DeployContractParams {
  /** Contract ABI — forwarded to `tronWeb.transactionBuilder.createSmartContract`. */
  abi: readonly unknown[];
  /** Compiled bytecode (hex, with or without `0x` prefix). */
  bytecode: string;
  /** Human-readable contract name (shown in the approval UI). */
  contractName?: string;
  /** Constructor parameters as `Array<{type, value}>`. */
  parameters?: ReadonlyArray<{ type: string; value: unknown }>;
  /** Expected owner address. UI rejects on connected-wallet mismatch when set. */
  from?: string;
  /** Max energy fee in SUN. Defaults to 1500 TRX in the UI if omitted. */
  feeLimit?: string;
  /** TRX value (in SUN) to send to the constructor. */
  callValue?: string;
  /** Origin energy limit. Defaults to 10_000_000 in the UI if omitted. */
  originEnergyLimit?: number;
  /** Percentage of fee user pays (0-100). Defaults to 100 in the UI if omitted. */
  userFeePercentage?: number;
  network?: TronNetwork;
}

/** Result of {@linkcode WalletSigner.deployContract}. */
export interface DeployContractResult {
  /** Broadcast tx hash. */
  txHash: string;
  /** Deployed contract address (T-prefixed Base58). */
  contractAddress: string;
  approvalUrl: string;
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

/** Result of {@linkcode WalletSigner.getTokenBalance}: TRC-20 balance formatted and raw, plus token metadata. */
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
 * Programmatic interface to the TRON wallet signer. Each instance owns one `serve` subprocess,
 * which in turn owns the bridge and the browser tab.
 */
export class WalletSigner {
  readonly #bridge: Bridge;
  readonly #defaultNetwork: TronNetwork;

  constructor(options?: WalletSignerOptions) {
    this.#bridge = new Bridge("tron", options?.openBrowser ?? true);
    this.#defaultNetwork = options?.defaultNetwork ?? getDefaultNetwork();
  }

  /** The configured default network */
  get defaultNetwork(): TronNetwork {
    return this.#defaultNetwork;
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

  /** Send one request through the bridge, defaulting its network. */
  async #request(body: Record<string, unknown>): Promise<{ result: string; approvalUrl: string }> {
    return this.#bridge.request({ ...body, network: body["network"] ?? this.#defaultNetwork });
  }

  /** Connect to TronLink and get the wallet address. */
  async connectWallet(options?: { network?: TronNetwork; address?: string }): Promise<ConnectResult> {
    const { result, approvalUrl } = await this.#request({
      type: "connect",
      network: options?.network,
      address: options?.address,
    });
    return { address: result, approvalUrl };
  }

  /** Send a native TRX transfer via TronLink. */
  async sendTransaction(params: SendTransactionParams): Promise<TransactionResult> {
    const { result, approvalUrl } = await this.#request({ type: "send_transaction", ...params });
    return { txHash: result, approvalUrl };
  }

  /** Trigger a smart-contract function via TronLink (TRC-20 transfers, etc.). */
  async triggerContract(params: TriggerContractParams): Promise<TransactionResult> {
    const { result, approvalUrl } = await this.#request({ type: "trigger_contract", ...params });
    return { txHash: result, approvalUrl };
  }

  /**
   * Deploy a smart contract via `tronWeb.transactionBuilder.createSmartContract`. The browser
   * builds, signs, and broadcasts the deployment using the connected wallet's tronWeb instance.
   */
  async deployContract(params: DeployContractParams): Promise<DeployContractResult> {
    const { result: raw, approvalUrl } = await this.#request({ type: "deploy_contract", ...params });

    let parsed: { txHash?: string; contractAddress?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`browser-tron-signer: malformed deploy_contract result: ${raw}`);
    }
    if (!parsed.txHash || !parsed.contractAddress) {
      throw new Error(`browser-tron-signer: missing fields in deploy_contract result: ${raw}`);
    }
    return { txHash: parsed.txHash, contractAddress: parsed.contractAddress, approvalUrl };
  }

  /** Sign an arbitrary message via `tronWeb.trx.signMessageV2`. */
  async signMessage(params: SignMessageParams): Promise<SignResult> {
    const { result, approvalUrl } = await this.#request({ type: "sign_message", ...params });
    return { signature: result, approvalUrl };
  }

  /** Sign TIP-712 typed data via `tronWeb.trx._signTypedData`. */
  async signTypedData(params: SignTypedDataParams): Promise<SignResult> {
    const { result, approvalUrl } = await this.#request({ type: "sign_typed_data", ...params });
    return { signature: result, approvalUrl };
  }

  /**
   * Get the native TRX balance of an address. No browser interaction — direct HTTP to TronGrid.
   *
   * TronGrid accepts either a hex address (41…) or a Base58 address; we pass `visible: true` so
   * the API accepts the Base58 form returned by TronLink.
   */
  async getBalance(params: { address: string; network?: TronNetwork }): Promise<BalanceResult> {
    const network = params.network ?? this.#defaultNetwork;
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

  /**
   * Get the TRC-20 token balance of a TRON address via `triggerconstantcontract`. No browser
   * interaction. `symbol` falls back to `""` if the token does not implement it.
   */
  async getTokenBalance(params: {
    contractAddress: string;
    address: string;
    network?: TronNetwork;
  }): Promise<TokenBalanceResult> {
    const network = params.network ?? this.#defaultNetwork;
    const fullHost = getFullHost(network);
    if (!fullHost) throw new Error(`Unknown TRON network: ${network}`);

    const holderArg = padAddressArg(tronAddressToHex20(params.address));

    const [rawHex, decimalsHex, symbolHex] = await Promise.all([
      triggerConstant(fullHost, params.contractAddress, "balanceOf(address)", holderArg),
      triggerConstant(fullHost, params.contractAddress, "decimals()", ""),
      triggerConstant(fullHost, params.contractAddress, "symbol()", "").catch(() => ""),
    ]);

    const raw = BigInt("0x" + rawHex);
    const decimals = Number(BigInt("0x" + decimalsHex));
    const symbol = symbolHex ? decodeAbiString(symbolHex) : "";

    return {
      balance: formatSun(raw, decimals),
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

/**
 * Convert a TRON Base58 address (T…) to its 20-byte hex form (no `41` prefix, no `0x`).
 * Skips checksum verification — TronGrid rejects malformed addresses downstream anyway.
 */
function tronAddressToHex20(addr: string): string {
  const decoded = base58.decode(addr);
  if (decoded.length !== 25) throw new Error(`Invalid TRON address length: ${addr}`);
  if (decoded[0] !== 0x41) throw new Error(`Invalid TRON address prefix: ${addr}`);
  return [...decoded.slice(1, 21)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Left-pad a 20-byte hex address to a 32-byte ABI `address` argument. */
function padAddressArg(hex20: string): string {
  return "0".repeat(24) + hex20;
}

/** Decode an ABI-encoded `string` return value (offset + length + utf-8 bytes). */
function decodeAbiString(hex: string): string {
  if (hex.length < 128) return "";
  const length = Number(BigInt("0x" + hex.slice(64, 128)));
  if (length === 0) return "";
  const dataHex = hex.slice(128, 128 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

/** POST a `triggerconstantcontract` read call; return the first `constant_result` hex string. */
async function triggerConstant(
  fullHost: string,
  contractAddress: string,
  functionSelector: string,
  parameter: string,
): Promise<string> {
  const resp = await fetch(`${fullHost}/wallet/triggerconstantcontract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Owner must be a valid TRON address; the contract itself is always valid and avoids
      // needing a real holder for read-only calls.
      owner_address: contractAddress,
      contract_address: contractAddress,
      function_selector: functionSelector,
      parameter,
      visible: true,
    }),
  });
  if (!resp.ok) throw new Error(`triggerconstantcontract failed: HTTP ${resp.status}`);
  const data = await resp.json() as { constant_result?: string[]; result?: { message?: string } };
  const result = data.constant_result?.[0];
  if (!result) throw new Error(`triggerconstantcontract returned no result: ${JSON.stringify(data)}`);
  return result;
}

// Side-effect-free re-export so callers can reach NETWORKS without an extra import.
export { NETWORKS };
