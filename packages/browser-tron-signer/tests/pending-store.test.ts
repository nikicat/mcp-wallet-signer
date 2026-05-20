import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { pendingStore } from "../src/pending-store.ts";

Deno.test("PendingStore - creates connect request", async () => {
  const { id, promise } = pendingStore.createConnectRequest({ network: "mainnet" });

  assertExists(id);
  assertEquals(id.length, 36); // UUID length

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "connect");
  assertEquals(request.network, "mainnet");

  pendingStore.complete(id, { success: true, result: "TXYZ" });
  const result = await promise;
  assertEquals(result.success, true);
  if (result.success) assertEquals(result.result, "TXYZ");
});

Deno.test("PendingStore - creates connect request with required address", async () => {
  const expected = "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS";
  const { id, promise } = pendingStore.createConnectRequest({ network: "shasta", address: expected });

  const request = pendingStore.get(id);
  assertExists(request);
  if (request.type === "connect") {
    assertEquals(request.address, expected);
    assertEquals(request.network, "shasta");
  }

  pendingStore.complete(id, { success: true, result: expected });
  await promise;
});

Deno.test("PendingStore - creates send_transaction request", async () => {
  const { id, promise } = pendingStore.createSendTransactionRequest({
    to: "TRecipient",
    amount: "1000000", // 1 TRX in SUN
    network: "mainnet",
  });

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "send_transaction");
  if (request.type === "send_transaction") {
    assertEquals(request.to, "TRecipient");
    assertEquals(request.amount, "1000000");
  }

  pendingStore.complete(id, { success: true, result: "tx-hash-stub" });
  await promise;
});

Deno.test("PendingStore - creates trigger_contract request", async () => {
  const { id, promise } = pendingStore.createTriggerContractRequest({
    contractAddress: "TContract",
    functionSelector: "transfer(address,uint256)",
    parameters: [{ type: "address", value: "TRecip" }, { type: "uint256", value: "100" }],
    feeLimit: "150000000",
    network: "mainnet",
  });

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "trigger_contract");
  if (request.type === "trigger_contract") {
    assertEquals(request.functionSelector, "transfer(address,uint256)");
    assertEquals(request.parameters?.length, 2);
  }

  pendingStore.complete(id, { success: true, result: "tx-hash-stub" });
  await promise;
});

Deno.test("PendingStore - creates sign_message request", async () => {
  const { id, promise } = pendingStore.createSignMessageRequest({
    message: "Hello TRON",
    network: "mainnet",
  });

  const request = pendingStore.get(id);
  assertExists(request);
  if (request.type === "sign_message") assertEquals(request.message, "Hello TRON");

  pendingStore.complete(id, { success: true, result: "0xSignature" });
  await promise;
});

Deno.test("PendingStore - creates sign_typed_data request", async () => {
  const { id, promise } = pendingStore.createSignTypedDataRequest({
    domain: { name: "Test", version: "1" },
    types: { Person: [{ name: "name", type: "string" }] },
    primaryType: "Person",
    message: { name: "Alice" },
    network: "mainnet",
  });

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "sign_typed_data");

  pendingStore.complete(id, { success: true, result: "0xTypedSig" });
  await promise;
});

Deno.test("PendingStore - completes with error", async () => {
  const { id, promise } = pendingStore.createConnectRequest();
  pendingStore.complete(id, { success: false, error: "User rejected" });
  const result = await promise;
  assertEquals(result.success, false);
  if (!result.success) assertEquals(result.error, "User rejected");
});

Deno.test("PendingStore - cancels request", async () => {
  const { id, promise } = pendingStore.createConnectRequest();
  pendingStore.cancel(id, "Cancelled by test");
  await assertRejects(() => promise, Error, "Cancelled by test");
});
