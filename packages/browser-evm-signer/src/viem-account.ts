import type { Address, CustomSource, CustomTransport, Hex } from "viem";

import type { SignTypedDataParams, WalletSigner } from "./wallet-signer.ts";
import { walletSignerTransport, type WalletSignerTransportOptions } from "./transport.ts";

/** A viem-compatible hybrid account: type "json-rpc" for transport-routed sends, with signMessage/signTypedData. */
export interface ViemBrowserAccount {
  address: Address;
  type: "json-rpc";
  signMessage: CustomSource["signMessage"];
  signTypedData: CustomSource["signTypedData"];
  signTransaction: never;
}

/** Options for {@linkcode connectWalletViem}. */
export interface ConnectWalletViemOptions extends WalletSignerTransportOptions {
  /** Pre-connected address — skips the connectWallet() browser prompt if provided. */
  address?: Address;
}

/**
 * Connect to a browser wallet and return a viem-compatible hybrid account + custom transport.
 *
 * The account uses type "json-rpc" so viem routes eth_sendTransaction through the transport
 * (which forwards to the browser wallet), while signMessage/signTypedData are available for
 * direct calls from application code.
 */
export async function connectWalletViem(
  signer: WalletSigner,
  options?: ConnectWalletViemOptions,
): Promise<{ account: ViemBrowserAccount; transport: CustomTransport }> {
  const address = (options?.address ?? (await signer.connectWallet()).address) as Address;

  const signMessage: CustomSource["signMessage"] = async ({ message }) => {
    let msg: string;
    if (typeof message === "string") {
      msg = message;
    } else {
      msg = typeof message.raw === "string" ? message.raw : new TextDecoder().decode(message.raw);
    }
    const { signature } = await signer.signMessage({ message: msg, address });
    return signature as Hex;
  };

  // viem's CustomSource["signTypedData"] uses heavily generic conditional types (TypedDataDefinition)
  // that TypeScript can't prove assignable to any concrete type inside the generic callback.
  const signTypedData: CustomSource["signTypedData"] = async (params) => {
    const { signature } = await signer.signTypedData({
      ...(params as unknown as SignTypedDataParams),
      address,
    });
    return signature as Hex;
  };

  const account: ViemBrowserAccount = {
    address,
    type: "json-rpc",
    signMessage,
    signTypedData,
    signTransaction: undefined as never,
  };

  return { account, transport: walletSignerTransport(signer, options) };
}
