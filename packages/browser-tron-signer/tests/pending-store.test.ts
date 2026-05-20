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

Deno.test("PendingStore - creates deploy_contract request", async () => {
  const abi = [{ type: "constructor", inputs: [{ name: "owner", type: "address" }] }];
  const { id, promise } = pendingStore.createDeployContractRequest({
    abi,
    bytecode: "0x6080604052",
    contractName: "TestToken",
    parameters: [{ type: "address", value: "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS" }],
    feeLimit: "1500000000",
    originEnergyLimit: 10_000_000,
    userFeePercentage: 100,
    network: "shasta",
  });

  const request = pendingStore.get(id);
  assertExists(request);
  assertEquals(request.type, "deploy_contract");
  if (request.type === "deploy_contract") {
    assertEquals(request.bytecode, "0x6080604052");
    assertEquals(request.contractName, "TestToken");
    assertEquals(request.abi, abi);
    assertEquals(request.parameters?.length, 1);
    assertEquals(request.feeLimit, "1500000000");
    assertEquals(request.originEnergyLimit, 10_000_000);
    assertEquals(request.userFeePercentage, 100);
    assertEquals(request.network, "shasta");
  }

  pendingStore.complete(id, {
    success: true,
    result: JSON.stringify({ txHash: "deploy-tx-hash", contractAddress: "TContractDeployed" }),
  });
  await promise;
});

Deno.test("PendingStore - deploy_contract omits optional fields cleanly", async () => {
  const { id, promise } = pendingStore.createDeployContractRequest({
    abi: [],
    bytecode: "deadbeef",
  });

  const request = pendingStore.get(id);
  assertExists(request);
  if (request.type === "deploy_contract") {
    assertEquals(request.parameters, undefined);
    assertEquals(request.feeLimit, undefined);
    assertEquals(request.network, undefined);
    assertEquals(request.from, undefined);
  }

  pendingStore.cancel(id, "cleanup");
  try {
    await promise;
  } catch { /* expected */ }
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
