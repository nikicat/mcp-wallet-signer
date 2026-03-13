import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { getPort } from "./config.ts";
import { PendingStore, pendingStore as defaultPendingStore } from "./pending-store.ts";
import type { CompleteApiRequest, PendingApiResponse } from "./types.ts";
import { getIndexHtml } from "./web-ui.ts";

// Store test results for e2e browser testing
const testResults = new Map<string, { success: boolean; result?: string; error?: string }>();

/**
 * Handle API requests
 */
function handleApiRequest(pathname: string, method: string, body: unknown, store: PendingStore): Response {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET /api/pending/:id - Get pending request details
  const pendingMatch = pathname.match(/^\/api\/pending\/([a-f0-9-]+)$/);
  if (pendingMatch && method === "GET") {
    const id = pendingMatch[1];
    const request = store.get(id);

    if (!request) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response: PendingApiResponse = { request };
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // POST /api/complete/:id - Complete a pending request
  const completeMatch = pathname.match(/^\/api\/complete\/([a-f0-9-]+)$/);
  if (completeMatch && method === "POST") {
    const id = completeMatch[1];

    if (!store.has(id)) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = body as CompleteApiRequest;

    if (typeof data.success !== "boolean") {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = data.success
      ? { success: true as const, result: data.result || "" }
      : { success: false as const, error: data.error || "Unknown error" };

    const completed = store.complete(id, result);

    if (!completed) {
      return new Response(JSON.stringify({ error: "Failed to complete request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // GET /api/health - Health check
  if (pathname === "/api/health" && method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        pendingRequests: store.size,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // === Test endpoints (for e2e browser testing) ===

  // POST /api/test/create-request - Create a pending request for testing
  if (pathname === "/api/test/create-request" && method === "POST") {
    const data = body as Record<string, unknown>;
    const type = data.type as string;

    let id: string;
    let promise: Promise<unknown>;

    switch (type) {
      case "connect": {
        const result = store.createConnectRequest({
          chainId: data.chainId as number | undefined,
          address: data.address as string | undefined,
        });
        id = result.id;
        promise = result.promise;
        break;
      }
      case "send_transaction": {
        const result = store.createSendTransactionRequest({
          to: data.to as string,
          value: data.value as string | undefined,
          data: data.data as string | undefined,
          chainId: data.chainId as number | undefined,
          gasLimit: data.gasLimit as string | undefined,
          maxFeePerGas: data.maxFeePerGas as string | undefined,
          maxPriorityFeePerGas: data.maxPriorityFeePerGas as string | undefined,
        });
        id = result.id;
        promise = result.promise;
        break;
      }
      case "sign_message": {
        const result = store.createSignMessageRequest({
          message: data.message as string,
          address: data.address as string | undefined,
          chainId: data.chainId as number | undefined,
        });
        id = result.id;
        promise = result.promise;
        break;
      }
      case "sign_typed_data": {
        const result = store.createSignTypedDataRequest({
          domain: data.domain as Parameters<typeof store.createSignTypedDataRequest>[0]["domain"],
          types: data.types as Parameters<typeof store.createSignTypedDataRequest>[0]["types"],
          primaryType: data.primaryType as string,
          message: data.message as Record<string, unknown>,
          address: data.address as string | undefined,
          chainId: data.chainId as number | undefined,
        });
        id = result.id;
        promise = result.promise;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid request type" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Store the promise result for later retrieval
    promise.then((result) => {
      testResults.set(id, result as { success: boolean; result?: string; error?: string });
    }).catch((err) => {
      testResults.set(id, { success: false, error: err.message });
    });

    return new Response(JSON.stringify({ id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // GET /api/test/result/:id - Get test result
  const testResultMatch = pathname.match(/^\/api\/test\/result\/([a-f0-9-]+)$/);
  if (testResultMatch && method === "GET") {
    const id = testResultMatch[1];
    const result = testResults.get(id);

    if (result === undefined) {
      // Check if request is still pending
      if (store.has(id)) {
        return new Response(JSON.stringify({ pending: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Result not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Read the full request body from an IncomingMessage as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Write a web-standard Response to a Node ServerResponse.
 */
async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    res.end(bytes);
  } else {
    res.end();
  }
}

/**
 * Serve the inline HTML page for any non-API GET request (SPA routing).
 */
function serveHtml(): Response {
  return new Response(getIndexHtml(), {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Create a node:http request handler using the existing Response-based logic.
 */
function makeHandler(store: PendingStore) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;
    const method = req.method || "GET";

    let response: Response;

    if (pathname.startsWith("/api/")) {
      let body: unknown = null;
      if (method === "POST") {
        try {
          const raw = await readBody(req);
          body = JSON.parse(raw);
        } catch {
          response = new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
          await writeResponse(res, response);
          return;
        }
      }
      response = handleApiRequest(pathname, method, body, store);
    } else {
      response = serveHtml();
    }

    await writeResponse(res, response);
  };
}

/**
 * Create an HTTP server bound to a PendingStore.
 * Returns the port and a stop function.
 */
export async function createHttpServer(
  store: PendingStore,
  port?: number,
): Promise<{ port: number; stop: () => Promise<void> }> {
  const targetPort = port ?? getPort();

  const srv = createServer(makeHandler(store));

  await new Promise<void>((resolve) => {
    srv.listen(targetPort, "127.0.0.1", () => resolve());
  });

  const actualPort = (srv.address() as AddressInfo).port;

  return {
    port: actualPort,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        srv.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/**
 * Start a test server on a random port using the default PendingStore.
 */
export function startTestServer(): Promise<{ port: number; stop: () => Promise<void> }> {
  return createHttpServer(defaultPendingStore, 0);
}
