import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { PendingStore } from "./pending-store.ts";
import type { BaseRequest, CompleteApiRequest, PendingApiResponse } from "./types.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/** Context passed to {@linkcode HttpServerOptions.extraApi} handlers. */
export interface ExtraApiContext<R extends BaseRequest = BaseRequest> {
  pathname: string;
  method: string;
  /** Parsed JSON body for POST requests; `null` for GETs and OPTIONS. */
  body: unknown;
  store: PendingStore<R>;
  corsHeaders: typeof CORS_HEADERS;
}

/**
 * Optional handler that may serve API routes the core layer does not know about (e.g. test-only
 * endpoints that create chain-specific requests). Return `null` to fall through to the default
 * 404 behaviour.
 */
export type ExtraApiHandler<R extends BaseRequest = BaseRequest> = (
  ctx: ExtraApiContext<R>,
) => Response | null;

/** Options for {@linkcode createHttpServer}. */
export interface HttpServerOptions<R extends BaseRequest = BaseRequest> {
  store: PendingStore<R>;
  /** Bind port. Defaults to 0 (OS-assigned). */
  port?: number;
  /** Returns the static HTML page served for any non-API GET (SPA routing). */
  getIndexHtml: () => string;
  /** Optional hook for chain-specific API routes. Runs before the default 404. */
  extraApi?: ExtraApiHandler<R>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function handleCoreApi<R extends BaseRequest>(
  pathname: string,
  method: string,
  body: unknown,
  store: PendingStore<R>,
): Response | null {
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const pendingMatch = pathname.match(/^\/api\/pending\/([a-f0-9-]+)$/);
  if (pendingMatch && method === "GET") {
    const id = pendingMatch[1];
    const request = store.get(id);
    if (!request) return jsonResponse(404, { error: "Request not found" });
    const response: PendingApiResponse<R> = { request };
    return jsonResponse(200, response);
  }

  const completeMatch = pathname.match(/^\/api\/complete\/([a-f0-9-]+)$/);
  if (completeMatch && method === "POST") {
    const id = completeMatch[1];
    if (!store.has(id)) return jsonResponse(404, { error: "Request not found" });

    const data = body as CompleteApiRequest;
    if (typeof data?.success !== "boolean") {
      return jsonResponse(400, { error: "Invalid request body" });
    }

    const result = data.success
      ? { success: true as const, result: data.result || "" }
      : { success: false as const, error: data.error || "Unknown error", code: data.code };

    if (!store.complete(id, result)) {
      return jsonResponse(500, { error: "Failed to complete request" });
    }
    return jsonResponse(200, { ok: true });
  }

  if (pathname === "/api/health" && method === "GET") {
    return jsonResponse(200, { status: "ok", pendingRequests: store.size });
  }

  return null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    res.end(bytes);
  } else {
    res.end();
  }
}

function makeHandler<R extends BaseRequest>(options: HttpServerOptions<R>) {
  const { store, getIndexHtml, extraApi } = options;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url!, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;
    const method = req.method || "GET";

    let response: Response;

    if (pathname.startsWith("/api/")) {
      let body: unknown = null;
      if (method === "POST") {
        try {
          const raw = await readBody(req);
          body = raw.length > 0 ? JSON.parse(raw) : null;
        } catch {
          await writeResponse(res, jsonResponse(400, { error: "Invalid JSON" }));
          return;
        }
      }

      const core = handleCoreApi(pathname, method, body, store);
      if (core) {
        response = core;
      } else if (extraApi) {
        const extra = extraApi({ pathname, method, body, store, corsHeaders: CORS_HEADERS });
        response = extra ?? jsonResponse(404, { error: "Not found" });
      } else {
        response = jsonResponse(404, { error: "Not found" });
      }
    } else {
      response = new Response(getIndexHtml(), {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-cache" },
      });
    }

    await writeResponse(res, response);
  };
}

/**
 * Create an HTTP server bound to a {@linkcode PendingStore}. Returns the actual port (relevant
 * when `port: 0` was passed) and a `stop()` function.
 */
export async function createHttpServer<R extends BaseRequest>(
  options: HttpServerOptions<R>,
): Promise<{ port: number; stop: () => Promise<void> }> {
  const targetPort = options.port ?? 0;
  const srv = createServer(makeHandler(options));

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

/** Re-exported for use by chain-specific extraApi handlers. */
export { CORS_HEADERS, jsonResponse };
