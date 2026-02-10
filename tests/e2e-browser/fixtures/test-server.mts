/**
 * Test server utilities for e2e browser tests.
 * Starts the HTTP server in-process on a random port.
 */

import { startTestServer } from "../../../src/http-server.ts";
import { pendingStore } from "../../../src/pending-store.ts";

let baseUrl = "";
let stopFn: (() => Promise<void>) | null = null;

export { pendingStore };

export function getBaseUrl(): string {
  return baseUrl;
}

/**
 * Start the HTTP server in-process on a random port.
 */
export function startServer(): number {
  const { port, stop } = startTestServer();
  baseUrl = `http://127.0.0.1:${port}`;
  stopFn = stop;
  return port;
}

/**
 * Stop the HTTP server.
 */
export async function stopServer(): Promise<void> {
  if (stopFn) {
    await stopFn();
    stopFn = null;
    baseUrl = "";
  }
}

/**
 * Create a pending request via the test API.
 */
export async function createTestRequest(
  type: "connect" | "send_transaction" | "sign_message" | "sign_typed_data",
  data: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/test/create-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...data }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create request: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Get the result of a completed request.
 */
export async function getTestResult(
  id: string
): Promise<{ success: boolean; result?: string; error?: string; pending?: boolean } | null> {
  const res = await fetch(`${baseUrl}/api/test/result/${id}`);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get result: ${res.status}`);

  return res.json();
}
