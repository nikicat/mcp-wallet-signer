/**
 * browser-evm-signer — **deprecated**, kept as a compatibility shim.
 *
 * Every signing call now runs through
 * [browser-web3-signer](https://github.com/nikicat/browser-web3-signer), which superseded this
 * package: it owns the localhost bridge, the approval page and the browser tab. The public API
 * below is unchanged apart from what the old in-process HTTP server exposed — `PendingStore`,
 * `createHttpServer`, `startTestServer`, `buildConnectUrl`, `buildSignUrl` and `openBrowser` are
 * gone, since there is no longer an in-process server to drive.
 *
 * New code should use `browser-web3-signer` directly.
 */

export {
  type BalanceResult,
  type ConnectResult,
  type SendTransactionParams,
  type SignMessageParams,
  type SignResult,
  type SignTypedDataParams,
  type TokenBalanceResult,
  type TransactionResult,
  WalletSigner,
  type WalletSignerOptions,
} from "./wallet-signer.ts";

export { CHAINS, DEFAULT_PORT, getChainConfig, getDefaultChainId, getPort, getRpcUrl } from "./config.ts";
export type { ChainConfig, TypedDataDomain, TypedDataField } from "./types.ts";

export { findWrongWalletAddressError, SignerErrorCode, WrongWalletAddressError } from "browser-web3-signer";

export { walletSignerTransport, type WalletSignerTransportOptions } from "./transport.ts";
export { connectWalletViem, type ConnectWalletViemOptions, type ViemBrowserAccount } from "./viem-account.ts";

/** The shim's version. Tracks this package, not the `browser-web3-signer` it delegates to. */
export const VERSION = "0.3.1";
