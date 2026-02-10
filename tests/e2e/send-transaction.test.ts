/**
 * E2E tests for transaction signing flow.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { startTestServer } from "../../src/http-server.ts";

Deno.test({
  name: "E2E - Transaction request API flow",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = startTestServer();

    try {
      // Create a transaction request
      const { id, promise } = pendingStore.createSendTransactionRequest({
        to: "0x742d35Cc6634C0532925a3b844Bc9e7595f1E7eC",
        value: "1000000000000000000", // 1 ETH in wei
        chainId: 1,
      });

      // Fetch request via API
      const getRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      assertEquals(getRes.ok, true);

      const data = await getRes.json();
      assertEquals(data.request.type, "send_transaction");
      assertEquals(data.request.to, "0x742d35Cc6634C0532925a3b844Bc9e7595f1E7eC");
      assertEquals(data.request.value, "1000000000000000000");
      assertEquals(data.request.chainId, 1);

      // Complete with tx hash
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          result: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        }),
      });

      assertEquals(completeRes.ok, true);
      await completeRes.json(); // Consume body

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) {
        assertEquals(
          result.result,
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        );
      }
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - Transaction with contract data",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = startTestServer();

    try {
      // Create a contract call request
      const { id, promise } = pendingStore.createSendTransactionRequest({
        to: "0xContractAddress",
        value: "0",
        data: "0xa9059cbb000000000000000000000000recipient0000000000000000000000amount",
        chainId: 1,
        gasLimit: "100000",
      });

      const getRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await getRes.json();

      assertExists(data.request.data);
      assertEquals(data.request.gasLimit, "100000");

      // Simulate rejection
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "User rejected transaction",
        }),
      });
      await completeRes.json(); // Consume body

      const result = await promise;
      assertEquals(result.success, false);
      if (!result.success) {
        assertEquals(result.error, "User rejected transaction");
      }
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - Transaction with EIP-1559 gas parameters",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = startTestServer();

    try {
      const { id, promise } = pendingStore.createSendTransactionRequest({
        to: "0xRecipient",
        value: "1000000000000000000",
        chainId: 1,
        maxFeePerGas: "50000000000", // 50 gwei
        maxPriorityFeePerGas: "2000000000", // 2 gwei
      });

      const getRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await getRes.json();

      assertEquals(data.request.maxFeePerGas, "50000000000");
      assertEquals(data.request.maxPriorityFeePerGas, "2000000000");

      // Complete
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "0xTxHash" }),
      });
      await completeRes.json(); // Consume body

      await promise;
    } finally {
      await stop();
    }
  },
});
