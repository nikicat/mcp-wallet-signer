/**
 * HTTP-level e2e tests for the TRON wallet-connect flow. No browser involved — these exercise
 * the pendingStore + HTTP bridge in-process. For full browser tests see tests/e2e-browser/.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { startTestServer } from "../../src/http-server.ts";

const TEST_ADDRESS = "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS";

Deno.test({
  name: "E2E - HTTP server starts and serves API",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      assertEquals(healthRes.ok, true);
      const health = await healthRes.json();
      assertEquals(health.status, "ok");
      assertEquals(typeof health.pendingRequests, "number");
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - GET /api/pending/:id returns connect request details",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createConnectRequest({ network: "mainnet" });
      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      assertEquals(res.ok, true);
      const data = await res.json();
      assertEquals(data.request.id, id);
      assertEquals(data.request.type, "connect");
      assertEquals(data.request.network, "mainnet");

      pendingStore.cancel(id);
      try {
        await promise;
      } catch { /* expected */ }
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - GET /api/pending/:id returns 404 for non-existent request",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/pending/00000000-0000-0000-0000-000000000000`);
      assertEquals(res.status, 404);
      const data = await res.json();
      assertEquals(data.error, "Request not found");
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id completes connect successfully",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createConnectRequest({ network: "mainnet" });

      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: TEST_ADDRESS }),
      });
      assertEquals(res.ok, true);

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) assertEquals(result.result, TEST_ADDRESS);
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id completes with WRONG_WALLET_ADDRESS code",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createConnectRequest({
        network: "mainnet",
        address: TEST_ADDRESS,
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Wrong wallet address: expected Taaa, got Tbbb",
          code: "WRONG_WALLET_ADDRESS",
        }),
      });
      assertEquals(res.ok, true);

      const result = await promise;
      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(result.code, "WRONG_WALLET_ADDRESS");
        assertExists(result.error.match(/expected Taaa/));
      }
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - connect request with required address surfaces it in pending data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createConnectRequest({
        network: "shasta",
        address: TEST_ADDRESS,
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await res.json();
      assertEquals(data.request.address, TEST_ADDRESS);
      assertEquals(data.request.network, "shasta");

      pendingStore.cancel(id);
      try {
        await promise;
      } catch { /* expected */ }
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - POST /api/complete/:id returns 400 for invalid body",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createConnectRequest();
      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: "missing success field" }),
      });
      assertEquals(res.status, 400);
      await res.json();

      pendingStore.cancel(id);
      try {
        await promise;
      } catch { /* expected */ }
    } finally {
      await stop();
    }
  },
});
