/**
 * HTTP-level e2e tests for TRON smart-contract deployment.
 *
 * Covers both the in-process pendingStore + http-server pairing and the test-only
 * `/api/test/create-request` route used by the Playwright browser suite.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pendingStore } from "../../src/pending-store.ts";
import { startTestServer } from "../../src/http-server.ts";

const SENDER = "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS";
const DEPLOYED = "TDeployedContractAddress00000000000";
const FAKE_TX = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

const SAMPLE_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_owner", type: "address" }],
    stateMutability: "nonpayable",
  },
];

Deno.test({
  name: "E2E - deploy_contract round-trip via pendingStore",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createDeployContractRequest({
        abi: SAMPLE_ABI,
        bytecode: "0x6080604052",
        contractName: "Greeter",
        parameters: [{ type: "address", value: SENDER }],
        from: SENDER,
        feeLimit: "1500000000",
        callValue: "0",
        originEnergyLimit: 10_000_000,
        userFeePercentage: 100,
        network: "mainnet",
      });

      const fetchRes = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await fetchRes.json();
      assertEquals(data.request.type, "deploy_contract");
      assertEquals(data.request.contractName, "Greeter");
      assertEquals(data.request.bytecode, "0x6080604052");
      assertEquals(data.request.parameters.length, 1);
      assertEquals(data.request.feeLimit, "1500000000");
      assertEquals(data.request.originEnergyLimit, 10_000_000);
      assertEquals(data.request.userFeePercentage, 100);
      assertEquals(data.request.network, "mainnet");

      // Browser sends back JSON-encoded {txHash, contractAddress}.
      const payload = JSON.stringify({ txHash: FAKE_TX, contractAddress: DEPLOYED });
      const completeRes = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: payload }),
      });
      assertEquals(completeRes.ok, true);

      const result = await promise;
      assertEquals(result.success, true);
      if (result.success) assertEquals(result.result, payload);
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - /api/test/create-request accepts deploy_contract type",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/test/create-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "deploy_contract",
          abi: SAMPLE_ABI,
          bytecode: "0x6080604052",
          contractName: "TestContract",
          parameters: [{ type: "address", value: SENDER }],
          feeLimit: "1500000000",
          network: "shasta",
        }),
      });
      assertEquals(res.ok, true);
      const { id } = await res.json();
      assertExists(id);

      const pending = await fetch(`http://127.0.0.1:${port}/api/pending/${id}`);
      const data = await pending.json();
      assertEquals(data.request.type, "deploy_contract");
      assertEquals(data.request.contractName, "TestContract");
      assertEquals(data.request.network, "shasta");

      const payload = JSON.stringify({ txHash: FAKE_TX, contractAddress: DEPLOYED });
      await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: payload }),
      });

      // The test result endpoint should surface the stored result.
      // The handler writes to testResults via promise.then() — wait one microtask cycle.
      await new Promise((r) => setTimeout(r, 10));
      const resultRes = await fetch(`http://127.0.0.1:${port}/api/test/result/${id}`);
      const result = await resultRes.json();
      assertEquals(result.success, true);
      assertEquals(result.result, payload);
    } finally {
      await stop();
    }
  },
});

Deno.test({
  name: "E2E - deploy_contract rejection surfaces as error result",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { port, stop } = await startTestServer();
    try {
      const { id, promise } = pendingStore.createDeployContractRequest({
        abi: SAMPLE_ABI,
        bytecode: "0x00",
        network: "shasta",
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "User rejected contract deployment" }),
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
