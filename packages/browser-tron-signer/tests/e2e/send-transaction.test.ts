/**
 * HTTP-level e2e tests for TRON transaction flows (native TRX + contract calls).
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { startTestServer } from "../../src/http-server.ts";

const RECIPIENT = "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY";
const SENDER = "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS";
const FAKE_TX = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

Deno.test({
  name: "E2E - native TRX transfer request round-trip",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSendTransactionRequest({
        to: RECIPIENT,
        amount: "1000000", // 1 TRX
        network: "mainnet",
      });

      const fetchRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await fetchRes.json();
      assertEquals(data.request.type, "send_transaction");
      assertEquals(data.request.to, RECIPIENT);
      assertEquals(data.request.amount, "1000000");

      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: FAKE_TX }),
      });
      assertEquals(completeRes.ok, true);

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) assertEquals(result.result, FAKE_TX);
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - send_transaction with required from-address",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSendTransactionRequest({
        to: RECIPIENT,
        amount: "5000000", // 5 TRX
        from: SENDER,
        network: "mainnet",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await res.json();
      assertEquals(data.request.from, SENDER);

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
  name: "E2E - trigger_contract request preserves selector + parameters + feeLimit",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createTriggerContractRequest({
        contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // USDT
        functionSelector: "transfer(address,uint256)",
        parameters: [
          { type: "address", value: RECIPIENT },
          { type: "uint256", value: "1000000" },
        ],
        feeLimit: "150000000",
        network: "mainnet",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await res.json();
      assertEquals(data.request.type, "trigger_contract");
      assertEquals(data.request.functionSelector, "transfer(address,uint256)");
      assertEquals(data.request.feeLimit, "150000000");
      assertEquals(data.request.parameters.length, 2);
      assertEquals(data.request.parameters[0].type, "address");

      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: FAKE_TX }),
      });
      assertEquals(completeRes.ok, true);

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) assertEquals(result.result, FAKE_TX);
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - transaction rejection surfaces as error result",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createSendTransactionRequest({
        to: RECIPIENT,
        amount: "1",
        network: "mainnet",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "User rejected transaction" }),
      });
      assertEquals(res.ok, true);

      const result = await promise;
      assertEquals(result.success, false);
      if (!result.success) assertExists(result.error.match(/rejected/));
    } finally {
      await stop();
    }
  },
});
