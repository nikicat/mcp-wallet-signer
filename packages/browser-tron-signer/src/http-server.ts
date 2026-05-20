import { createHttpServer as coreCreateHttpServer } from "wallet-signer-core";

import { getPort } from "./config.ts";
import { PendingStore } from "./pending-store.ts";
import type { TronPendingRequest } from "./types.ts";
import { getIndexHtml } from "./web-ui.gen.ts";

/**
 * Create an HTTP server bound to a TRON {@linkcode PendingStore}. Returns the port and a stop
 * function. Mirrors `browser-evm-signer/createHttpServer`; no test-only routes today.
 */
export function createHttpServer(
  store: PendingStore,
  port?: number,
): Promise<{ port: number; stop: () => Promise<void> }> {
  return coreCreateHttpServer<TronPendingRequest>({
    store,
    port: port ?? getPort(),
    getIndexHtml,
  });
}
