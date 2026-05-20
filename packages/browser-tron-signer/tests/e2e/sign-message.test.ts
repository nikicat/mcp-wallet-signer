/**
 * HTTP-level e2e tests for TRON message-signing flows (sign_message + TIP-712).
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { startTestServer } from "../../src/http-server.ts";

const TEST_ADDRESS = "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS";

Deno.test({
  name: "E2E - sign_message round-trips a signature",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSignMessageRequest({
        message: "Hello TRON",
        network: "mainnet",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await res.json();
      assertEquals(data.request.type, "sign_message");
      assertEquals(data.request.message, "Hello TRON");

      await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "0xfake-signature" }),
      });

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) assertEquals(result.result, "0xfake-signature");
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - sign_message with required address propagates it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSignMessageRequest({
        message: "auth-challenge-xyz",
        address: TEST_ADDRESS,
        network: "mainnet",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await res.json();
      assertEquals(data.request.address, TEST_ADDRESS);

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
  name: "E2E - sign_typed_data (TIP-712) round-trip",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSignTypedDataRequest({
        domain: { name: "TIP-712 Test", version: "1" },
        types: { Greet: [{ name: "to", type: "string" }] },
        primaryType: "Greet",
        message: { to: "world" },
        network: "mainnet",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await res.json();
      assertEquals(data.request.type, "sign_typed_data");
      assertEquals(data.request.primaryType, "Greet");
      assertEquals(data.request.message.to, "world");

      await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "0xtyped-sig" }),
      });

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) assertEquals(result.result, "0xtyped-sig");
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - sign_typed_data rejection bubbles up",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSignTypedDataRequest({
        domain: { name: "TIP-712 Test", version: "1" },
        types: { Greet: [{ name: "to", type: "string" }] },
        primaryType: "Greet",
        message: { to: "world" },
        network: "mainnet",
      });

      await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "User rejected typed-data signing" }),
      });

      const result = await promise;
      assertEquals(result.success, false);
      if (!result.success) assertExists(result.error.match(/rejected/));
    } finally {
      await stop();
    }
  },
});
