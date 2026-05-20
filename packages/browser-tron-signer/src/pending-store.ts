import { generateRequestId, PendingStore as CorePendingStore, type RequestResult } from "wallet-signer-core";

import type {
  ConnectRequest,
  SendTransactionRequest,
  SignMessageRequest,
  SignTypedDataRequest,
  TriggerContractRequest,
  TronPendingRequest,
} from "./types.ts";

/**
 * TRON-specific {@linkcode CorePendingStore} subclass with typed factory helpers.
 */
export class PendingStore extends CorePendingStore<TronPendingRequest> {
  createConnectRequest(
    params?: { network?: ConnectRequest["network"]; address?: string },
  ): { id: string; promise: Promise<RequestResult> } {
    const request: ConnectRequest = {
      id: generateRequestId(),
      type: "connect",
      createdAt: Date.now(),
      network: params?.network,
      address: params?.address,
    };
    return this.create(request);
  }

  createSendTransactionRequest(params: {
    to: string;
    amount: string;
    from?: string;
    data?: string;
    network?: SendTransactionRequest["network"];
  }): { id: string; promise: Promise<RequestResult> } {
    const request: SendTransactionRequest = {
      id: generateRequestId(),
      type: "send_transaction",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }

  createTriggerContractRequest(params: {
    contractAddress: string;
    functionSelector: string;
    parameters?: TriggerContractRequest["parameters"];
    from?: string;
    feeLimit?: string;
    callValue?: string;
    network?: TriggerContractRequest["network"];
  }): { id: string; promise: Promise<RequestResult> } {
    const request: TriggerContractRequest = {
      id: generateRequestId(),
      type: "trigger_contract",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }

  createSignMessageRequest(
    params: { message: string; address?: string; network?: SignMessageRequest["network"] },
  ): { id: string; promise: Promise<RequestResult> } {
    const request: SignMessageRequest = {
      id: generateRequestId(),
      type: "sign_message",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }

  createSignTypedDataRequest(params: {
    domain: SignTypedDataRequest["domain"];
    types: SignTypedDataRequest["types"];
    primaryType: string;
    message: Record<string, unknown>;
    address?: string;
    network?: SignTypedDataRequest["network"];
  }): { id: string; promise: Promise<RequestResult> } {
    const request: SignTypedDataRequest = {
      id: generateRequestId(),
      type: "sign_typed_data",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }
}

/** Default singleton {@linkcode PendingStore} instance for the TRON signer. */
export const pendingStore: PendingStore = new PendingStore();
