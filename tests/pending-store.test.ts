import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Import the pending store
// Note: We need to import from source since tests run with Deno
import { pendingStore } from "../src/pending-store.ts";

Deno.test("PendingStore - creates connect request", async () => {
  const { id, promise } = pendingStore.createConnectRequest(1);

  assertExists(id);
  assertEquals(typeof id, "string");
  assertEquals(id.length, 36); // UUID length

  // Verify request is stored
  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "connect");
  assertEquals(request.chainId, 1);

  // Complete the request
  pendingStore.complete(id, { success: true, result: "0x1234" });

  const result = await promise;
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.result, "0x1234");
  }
});

Deno.test("PendingStore - creates send transaction request", async () => {
  const { id, promise } = pendingStore.createSendTransactionRequest({
    to: "0xRecipient",
    value: "1000000000000000000",
    chainId: 1,
  });

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "send_transaction");

  if (request.type === "send_transaction") {
    assertEquals(request.to, "0xRecipient");
    assertEquals(request.value, "1000000000000000000");
  }

  pendingStore.complete(id, { success: true, result: "0xTxHash" });

  const result = await promise;
  assertEquals(result.success, true);
});

Deno.test("PendingStore - creates sign message request", async () => {
  const { id, promise } = pendingStore.createSignMessageRequest({
    message: "Hello, world!",
    chainId: 1,
  });

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "sign_message");

  if (request.type === "sign_message") {
    assertEquals(request.message, "Hello, world!");
  }

  pendingStore.complete(id, { success: true, result: "0xSignature" });

  const result = await promise;
  assertEquals(result.success, true);
});

Deno.test("PendingStore - completes with error", async () => {
  const { id, promise } = pendingStore.createConnectRequest();

  pendingStore.complete(id, { success: false, error: "User rejected" });

  const result = await promise;
  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(result.error, "User rejected");
  }
});

Deno.test("PendingStore - cancels request", async () => {
  const { id, promise } = pendingStore.createConnectRequest();

  pendingStore.cancel(id, "Cancelled by test");

  await assertRejects(
    () => promise,
    Error,
    "Cancelled by test"
  );
});

Deno.test("PendingStore - returns undefined for non-existent request", () => {
  const request = pendingStore.get("non-existent-id");
  assertEquals(request, undefined);
});

Deno.test("PendingStore - has() returns correct values", async () => {
  const { id, promise } = pendingStore.createConnectRequest();

  assertEquals(pendingStore.has(id), true);
  assertEquals(pendingStore.has("non-existent"), false);

  // Clean up - need to await the rejection
  pendingStore.cancel(id);
  try {
    await promise;
  } catch {
    // Expected rejection
  }
});

Deno.test("PendingStore - complete returns false for non-existent request", () => {
  const result = pendingStore.complete("non-existent", { success: true, result: "test" });
  assertEquals(result, false);
});
