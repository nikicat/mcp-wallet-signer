/**
 * E2E tests for wallet connection flow.
 *
 * These tests require:
 * 1. The MCP server running
 * 2. A browser with a mocked wallet provider
 *
 * For full e2e testing, use Playwright with a test wallet.
 * This file contains integration tests that can run without a browser.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { ensureServerRunning, stopServer } from "../../src/http-server.ts";

Deno.test({
  name: "E2E - HTTP server starts and serves API",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Start the server
    const port = await ensureServerRunning();
    assertExists(port);

    try {
      // Test health endpoint
      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      assertEquals(healthRes.ok, true);

      const health = await healthRes.json();
      assertEquals(health.status, "ok");
      assertEquals(typeof health.pendingRequests, "number");
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - GET /api/pending/:id returns request details",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      // Create a pending request
      const { id, promise } = pendingStore.createConnectRequest(1);

      // Fetch the request via API
      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      assertEquals(res.ok, true);

      const data = await res.json();
      assertExists(data.request);
      assertEquals(data.request.id, id);
      assertEquals(data.request.type, "connect");
      assertEquals(data.request.chainId, 1);

      // Clean up
      pendingStore.cancel(id);
      try { await promise; } catch { /* expected */ }
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - GET /api/pending/:id returns 404 for non-existent request",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      // Use a valid UUID format that doesn't exist
      const res = await fetch(`http://127.0.0.1:${port}/api/pending/00000000-0000-0000-0000-000000000000`);
      assertEquals(res.status, 404);

      const data = await res.json();
      assertEquals(data.error, "Request not found");
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id completes request successfully",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      // Create a pending request
      const { id, promise } = pendingStore.createConnectRequest(1);

      // Complete the request via API
      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          result: "0xTestAddress",
        }),
      });

      assertEquals(res.ok, true);

      const data = await res.json();
      assertEquals(data.ok, true);

      // Verify promise resolved
      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.result, "0xTestAddress");
      }
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id completes request with error",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      // Create a pending request
      const { id, promise } = pendingStore.createConnectRequest();

      // Complete with error via API
      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "User rejected",
        }),
      });

      assertEquals(res.ok, true);

      const data = await res.json();
      assertEquals(data.ok, true);

      // Verify promise resolved with error
      const result = await promise;
      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(result.error, "User rejected");
      }
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id returns 404 for non-existent request",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      // Use a valid UUID format that doesn't exist
      const res = await fetch(`http://127.0.0.1:${port}/api/complete/00000000-0000-0000-0000-000000000000`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "test" }),
      });

      assertEquals(res.status, 404);
      await res.json(); // Consume body
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id returns 400 for invalid body",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      const { id, promise } = pendingStore.createConnectRequest();

      // Send invalid body (missing success field)
      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: "test" }),
      });

      assertEquals(res.status, 400);
      await res.json(); // Consume body

      // Clean up
      pendingStore.cancel(id);
      try { await promise; } catch { /* expected */ }
    } finally {
      await stopServer();
    }
  },
});
