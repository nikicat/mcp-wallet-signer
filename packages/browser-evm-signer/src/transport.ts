import { custom, hexToString } from "viem";
import type { CustomTransport } from "viem";

import type { SendTransactionParams, WalletSigner } from "./wallet-signer.ts";
import { getRpcUrl } from "./config.ts";

/** Options for {@linkcode walletSignerTransport}. */
export interface WalletSignerTransportOptions {
  /** JSON-RPC endpoint for chain-reading calls. Defaults to built-in RPC for the signer's default chain. */
  rpcUrl?: string;
}

/** Create a viem custom transport that routes wallet methods through WalletSigner. */
export function walletSignerTransport(
  signer: WalletSigner,
  options?: WalletSignerTransportOptions,
): CustomTransport {
  return custom({
    async request({ method, params }) {
      switch (method) {
        case "personal_sign": {
          const [messageHex, address] = params as [string, string];
          const message = hexToString(messageHex as `0x${string}`);
          const { signature } = await signer.signMessage({ message, address });
          return signature;
        }

        case "eth_sendTransaction": {
          const [tx] = params as [Record<string, string>];
          const sendParams: SendTransactionParams = { to: tx.to };
          if (tx.from) sendParams.from = tx.from;
          if (tx.data) sendParams.data = tx.data;
          if (tx.value) sendParams.value = BigInt(tx.value).toString();
          if (tx.gas) sendParams.gasLimit = BigInt(tx.gas).toString();
          if (tx.maxFeePerGas) sendParams.maxFeePerGas = BigInt(tx.maxFeePerGas).toString();
          if (tx.maxPriorityFeePerGas) {
            sendParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas).toString();
          }
          if (tx.chainId) sendParams.chainId = Number(BigInt(tx.chainId));
          const { txHash } = await signer.sendTransaction(sendParams);
          return txHash;
        }

        case "eth_signTypedData_v4": {
          const [address, typedDataJson] = params as [string, string];
          const { domain, types, primaryType, message } = JSON.parse(typedDataJson);
          const { signature } = await signer.signTypedData({ domain, types, primaryType, message, address });
          return signature;
        }

        case "eth_chainId":
          return `0x${signer.defaultChainId.toString(16)}`;

        default: {
          const rpcUrl = options?.rpcUrl ?? getRpcUrl(signer.defaultChainId);
          if (!rpcUrl) {
            throw new Error(
              `No RPC URL for chain ${signer.defaultChainId}. Provide rpcUrl in transport options.`,
            );
          }
          const resp = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
          });
          const json = await resp.json();
          if (json.error) {
            throw new Error(json.error.message ?? JSON.stringify(json.error));
          }
          return json.result;
        }
      }
    },
  }, { retryCount: 0 });
}
