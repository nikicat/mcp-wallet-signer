/**
 * E2E tests for message and typed data signing flows.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { ensureServerRunning, stopServer } from "../../src/http-server.ts";

Deno.test({
  name: "E2E - Sign message API flow",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      // Create a sign message request
      const { id, promise } = pendingStore.createSignMessageRequest({
        message: "Hello, Ethereum!",
        chainId: 1,
      });

      // Fetch request via API
      const getRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      assertEquals(getRes.ok, true);

      const data = await getRes.json();
      assertEquals(data.request.type, "sign_message");
      assertEquals(data.request.message, "Hello, Ethereum!");

      // Complete with signature
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          result: "0xSignatureHere",
        }),
      });

      assertEquals(completeRes.ok, true);
      await completeRes.json(); // Consume body

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.result, "0xSignatureHere");
      }
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - Sign message with specific address",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      const { id, promise } = pendingStore.createSignMessageRequest({
        message: "Sign with specific account",
        address: "0xSpecificAddress",
        chainId: 1,
      });

      const getRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await getRes.json();

      assertEquals(data.request.address, "0xSpecificAddress");

      // Complete
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "0xSig" }),
      });
      await completeRes.json(); // Consume body

      await promise;
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - Sign typed data (EIP-712) API flow",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      const domain = {
        name: "Test App",
        version: "1",
        chainId: 1,
        verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
      };

      const types = {
        Person: [
          { name: "name", type: "string" },
          { name: "wallet", type: "address" },
        ],
        Mail: [
          { name: "from", type: "Person" },
          { name: "to", type: "Person" },
          { name: "contents", type: "string" },
        ],
      };

      const message = {
        from: {
          name: "Alice",
          wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826",
        },
        to: {
          name: "Bob",
          wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        },
        contents: "Hello, Bob!",
      };

      const { id, promise } = pendingStore.createSignTypedDataRequest({
        domain,
        types,
        primaryType: "Mail",
        message,
        chainId: 1,
      });

      // Fetch request via API
      const getRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await getRes.json();

      assertEquals(data.request.type, "sign_typed_data");
      assertExists(data.request.domain);
      assertEquals(data.request.domain.name, "Test App");
      assertEquals(data.request.primaryType, "Mail");
      assertExists(data.request.types);
      assertExists(data.request.message);

      // Complete with signature
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          result: "0xTypedDataSignature",
        }),
      });
      await completeRes.json(); // Consume body

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(result.result, "0xTypedDataSignature");
      }
    } finally {
      await stopServer();
    }
  },
});

Deno.test({
  name: "E2E - Sign typed data rejection",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const port = await ensureServerRunning();

    try {
      const { id, promise } = pendingStore.createSignTypedDataRequest({
        domain: { name: "Test" },
        types: { Message: [{ name: "text", type: "string" }] },
        primaryType: "Message",
        message: { text: "Hello" },
        chainId: 1,
      });

      // User rejects
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "User rejected signing request",
        }),
      });
      await completeRes.json(); // Consume body

      const result = await promise;
      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(result.error, "User rejected signing request");
      }
    } finally {
      await stopServer();
    }
  },
});
