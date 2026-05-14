/** Discriminating codes the browser UI may attach to a rejection so consumers can react
 *  programmatically (e.g. clear caches) without string-matching error messages. */
export const SignerErrorCode = {
  /** The connected wallet account is different from the address the caller required. */
  WrongWalletAddress: "WRONG_WALLET_ADDRESS",
} as const;

export type SignerErrorCode = typeof SignerErrorCode[keyof typeof SignerErrorCode];

/** Thrown by `WalletSigner` when the user rejected because the connected wallet did not match
 *  the address the caller expected. Callers commonly invalidate any cached address on this. */
export class WrongWalletAddressError extends Error {
  override readonly name = "WrongWalletAddressError";
  readonly code = SignerErrorCode.WrongWalletAddress;
}

/** Walk an error's `cause` chain looking for a `WrongWalletAddressError`. Higher-level libraries
 *  (e.g. viem) frequently wrap signer errors, so consumers should not rely on bare `instanceof`. */
export function findWrongWalletAddressError(err: unknown): WrongWalletAddressError | undefined {
  for (let e: unknown = err; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    if (e instanceof WrongWalletAddressError) return e;
  }
  return undefined;
}
