/**
 * Test server utilities for e2e browser tests.
 * Starts the HTTP server in-process.
 */

import { ensureServerRunning, stopServer } from "../../../src/http-server.ts";
import { pendingStore } from "../../../src/pending-store.ts";

export { stopServer };

export const BASE_URL = "http://127.0.0.1:3847";

/**
 * Start the HTTP server in-process.
 */
export async function startServer(): Promise<number> {
  return await ensureServerRunning();
}

/**
 * Create a pending request via the test API.
 */
export async function createTestRequest(
  type: "connect" | "send_transaction" | "sign_message" | "sign_typed_data",
  data: Record<string, unknown> = {}
): Promise<{ id: string }> {
  const res = await fetch(`${BASE_URL}/api/test/create-request`, {
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
  const res = await fetch(`${BASE_URL}/api/test/result/${id}`);

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get result: ${res.status}`);

  return res.json();
}
