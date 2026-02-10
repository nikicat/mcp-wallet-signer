import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import { getPort } from "./config.ts";
import { pendingStore } from "./pending-store.ts";
import type { CompleteApiRequest, PendingApiResponse } from "./types.ts";

let server: Server | null = null;
let serverPort: number | null = null;

// Store test results for e2e browser testing
const testResults = new Map<string, { success: boolean; result?: string; error?: string }>();

/**
 * Get the path to the bundled web UI
 */
function getWebDistPath(): string {
  // In development, serve from web/dist
  // In production (npm package), serve from dist/web
  const scriptDir = new URL(".", import.meta.url).pathname;

  // Try production path first (dist/web relative to dist/)
  const prodPath = `${scriptDir}../dist/web`;
  try {
    statSync(prodPath);
    return prodPath;
  } catch {
    // Fall back to development path
    const devPath = `${scriptDir}../web/dist`;
    try {
      statSync(devPath);
      return devPath;
    } catch {
      // If neither exists, return production path (will fail later with clear error)
      return prodPath;
    }
  }
}

/**
 * Serve static files from the web dist directory
 */
async function serveStaticFile(path: string, webDistPath: string): Promise<Response> {
  // Default to index.html for SPA routing
  let filePath = path === "/" || path === "" ? "/index.html" : path;

  // Remove leading slash and sanitize
  filePath = filePath.replace(/^\/+/, "").replace(/\.\./g, "");

  const fullPath = `${webDistPath}/${filePath}`;

  try {
    const file = new Uint8Array(await readFile(fullPath));
    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    // For SPA, serve index.html for any unknown path
    if (!filePath.includes(".")) {
      try {
        const indexHtml = new Uint8Array(await readFile(`${webDistPath}/index.html`));
        return new Response(indexHtml, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache",
          },
        });
      } catch {
        return new Response("Web UI not found. Run 'deno task build:web' first.", {
          status: 404,
        });
      }
    }
    return new Response("Not found", { status: 404 });
  }
}

/**
 * Get content type from file extension
 */
function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    js: "application/javascript",
    mjs: "application/javascript",
    css: "text/css",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
  };
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Handle API requests
 */
function handleApiRequest(pathname: string, method: string, body: unknown): Response {
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
    const request = pendingStore.get(id);

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

    if (!pendingStore.has(id)) {
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

    const completed = pendingStore.complete(id, result);

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
        pendingRequests: pendingStore.size,
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
        const result = pendingStore.createConnectRequest(data.chainId as number | undefined);
        id = result.id;
        promise = result.promise;
        break;
      }
      case "send_transaction": {
        const result = pendingStore.createSendTransactionRequest({
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
        const result = pendingStore.createSignMessageRequest({
          message: data.message as string,
          address: data.address as string | undefined,
          chainId: data.chainId as number | undefined,
        });
        id = result.id;
        promise = result.promise;
        break;
      }
      case "sign_typed_data": {
        const result = pendingStore.createSignTypedDataRequest({
          domain: data.domain as Parameters<typeof pendingStore.createSignTypedDataRequest>[0]["domain"],
          types: data.types as Parameters<typeof pendingStore.createSignTypedDataRequest>[0]["types"],
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
      if (pendingStore.has(id)) {
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
 * Create a node:http request handler using the existing Response-based logic.
 */
function makeHandler(webDistPath: string) {
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
      response = handleApiRequest(pathname, method, body);
    } else {
      response = await serveStaticFile(pathname, webDistPath);
    }

    await writeResponse(res, response);
  };
}

/**
 * Start the HTTP server if not already running
 */
export async function ensureServerRunning(overridePort?: number): Promise<number> {
  if (server && serverPort) {
    return serverPort;
  }

  const port = overridePort ?? getPort();
  const webDistPath = getWebDistPath();

  const srv = createServer(makeHandler(webDistPath));

  await new Promise<void>((resolve) => {
    srv.listen(port, "127.0.0.1", () => resolve());
  });

  server = srv;
  serverPort = (srv.address() as AddressInfo).port;
  console.error(`[mcp-wallet-signer] HTTP server running on http://127.0.0.1:${serverPort}`);

  return serverPort;
}

/**
 * Get the current server port (if running)
 */
export function getServerPort(): number | null {
  return serverPort;
}

/**
 * Stop the HTTP server
 */
export async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
    serverPort = null;
  }
}

/**
 * Start an independent test server on a random port.
 * Returns { port, stop } — does NOT touch the module-level singleton.
 */
export async function startTestServer(): Promise<{ port: number; stop: () => Promise<void> }> {
  const webDistPath = getWebDistPath();

  const srv = createServer(makeHandler(webDistPath));

  await new Promise<void>((resolve) => {
    srv.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = srv.address() as AddressInfo;
  return {
    port: addr.port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        srv.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
