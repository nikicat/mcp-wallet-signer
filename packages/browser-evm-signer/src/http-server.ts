import { createHttpServer as coreCreateHttpServer, type ExtraApiContext, jsonResponse } from "wallet-signer-core";

import { getPort } from "./config.ts";
import { PendingStore, pendingStore as defaultPendingStore } from "./pending-store.ts";
import type { PendingRequest } from "./types.ts";
import { getIndexHtml } from "./web-ui.gen.ts";

// === Test endpoints (for e2e browser testing) ===
// Stored test results for retrieval by /api/test/result/:id. Module-scoped on purpose: these
// are only used by the browser e2e test harness, which keeps everything in one process.
const testResults = new Map<string, { success: boolean; result?: string; error?: string }>();

function handleTestRoutes(ctx: ExtraApiContext<PendingRequest>): Response | null {
  const { pathname, method, body, store } = ctx;
  const evmStore = store as PendingStore;

  if (pathname === "/api/test/create-request" && method === "POST") {
    const data = body as Record<string, unknown>;
    const type = data?.type as string;

    let id: string;
    let promise: Promise<unknown>;

    switch (type) {
      case "connect": {
        const r = evmStore.createConnectRequest({
          chainId: data.chainId as number | undefined,
          address: data.address as string | undefined,
        });
        id = r.id;
        promise = r.promise;
        break;
      }
      case "send_transaction": {
        const r = evmStore.createSendTransactionRequest({
          to: data.to as string,
          value: data.value as string | undefined,
          data: data.data as string | undefined,
          chainId: data.chainId as number | undefined,
          gasLimit: data.gasLimit as string | undefined,
          maxFeePerGas: data.maxFeePerGas as string | undefined,
          maxPriorityFeePerGas: data.maxPriorityFeePerGas as string | undefined,
        });
        id = r.id;
        promise = r.promise;
        break;
      }
      case "sign_message": {
        const r = evmStore.createSignMessageRequest({
          message: data.message as string,
          address: data.address as string | undefined,
          chainId: data.chainId as number | undefined,
        });
        id = r.id;
        promise = r.promise;
        break;
      }
      case "sign_typed_data": {
        const r = evmStore.createSignTypedDataRequest({
          domain: data.domain as Parameters<typeof evmStore.createSignTypedDataRequest>[0]["domain"],
          types: data.types as Parameters<typeof evmStore.createSignTypedDataRequest>[0]["types"],
          primaryType: data.primaryType as string,
          message: data.message as Record<string, unknown>,
          address: data.address as string | undefined,
          chainId: data.chainId as number | undefined,
        });
        id = r.id;
        promise = r.promise;
        break;
      }
      default:
        return jsonResponse(400, { error: "Invalid request type" });
    }

    promise.then((result) => {
      testResults.set(id, result as { success: boolean; result?: string; error?: string });
    }).catch((err) => {
      testResults.set(id, { success: false, error: err.message });
    });

    return jsonResponse(200, { id });
  }

  const testResultMatch = pathname.match(/^\/api\/test\/result\/([a-f0-9-]+)$/);
  if (testResultMatch && method === "GET") {
    const id = testResultMatch[1];
    const result = testResults.get(id);
    if (result === undefined) {
      if (store.has(id)) return jsonResponse(200, { pending: true });
      return jsonResponse(404, { error: "Result not found" });
    }
    return jsonResponse(200, result);
  }

  return null;
}

/**
 * Create an HTTP server bound to a {@linkcode PendingStore}.
 * Returns the port and a stop function.
 */
export function createHttpServer(
  store: PendingStore,
  port?: number,
): Promise<{ port: number; stop: () => Promise<void> }> {
  return coreCreateHttpServer<PendingRequest>({
    store,
    port: port ?? getPort(),
    getIndexHtml,
    extraApi: handleTestRoutes,
  });
}

/** Start a test server on a random port using the default {@linkcode PendingStore}. */
export function startTestServer(): Promise<{ port: number; stop: () => Promise<void> }> {
  return createHttpServer(defaultPendingStore, 0);
}
