import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createWalletClient } from "viem";
import { WalletSigner } from "../src/wallet-signer.ts";
import { walletSignerTransport } from "../src/transport.ts";

type Hex = `0x${string}`;
const ADDR: Hex = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function createTestClient(signer: WalletSigner, transportOpts?: { rpcUrl?: string }) {
  return createWalletClient({
    account: ADDR,
    transport: walletSignerTransport(signer, transportOpts),
  });
}

async function completePending(
  port: number,
  id: string,
  result: { success: boolean; result?: string; error?: string },
) {
  const resp = await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  assertEquals(resp.status, 200);
}

Deno.test({
  name: "walletSignerTransport: signMessage round-trip",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;
      const client = createTestClient(signer);

      // personal_sign params: [hex_message, address]
      // "Hello" = 0x48656c6c6f
      const sigPromise = client.request({
        method: "personal_sign",
        params: ["0x48656c6c6f" as Hex, ADDR],
      });
      await new Promise((r) => setTimeout(r, 0));

      const [id] = signer.pendingStore.getPendingIds();
      assertEquals(typeof id, "string");

      const fakeSig: Hex = "0xdeadbeef";
      await completePending(port, id, { success: true, result: fakeSig });

      assertEquals(await sigPromise, fakeSig);
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "walletSignerTransport: sendTransaction round-trip",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;
      const client = createTestClient(signer);

      const txPromise = client.request({
        method: "eth_sendTransaction",
        params: [{
          from: ADDR,
          to: "0x0000000000000000000000000000000000000001" as Hex,
          value: "0xde0b6b3a7640000" as Hex, // 1 ETH
        }],
      });
      await new Promise((r) => setTimeout(r, 0));

      const [id] = signer.pendingStore.getPendingIds();
      assertEquals(typeof id, "string");

      // Verify the pending request converted hex value to decimal string
      const req = signer.pendingStore.get(id)!;
      assertEquals(req.type, "send_transaction");

      const fakeHash: Hex = "0x1234abcd";
      await completePending(port, id, { success: true, result: fakeHash });

      assertEquals(await txPromise, fakeHash);
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "walletSignerTransport: signTypedData round-trip",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;
      const client = createTestClient(signer);

      const typedData = JSON.stringify({
        domain: { name: "Test", version: "1", chainId: 1 },
        types: {
          Mail: [
            { name: "from", type: "string" },
            { name: "contents", type: "string" },
          ],
        },
        primaryType: "Mail",
        message: { from: "Alice", contents: "Hello" },
      });

      const sigPromise = client.request({
        method: "eth_signTypedData_v4",
        params: [ADDR, typedData],
      });
      await new Promise((r) => setTimeout(r, 0));

      const [id] = signer.pendingStore.getPendingIds();
      assertEquals(typeof id, "string");

      const fakeSig: Hex = "0xabcdef";
      await completePending(port, id, { success: true, result: fakeSig });

      assertEquals(await sigPromise, fakeSig);
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "walletSignerTransport: eth_chainId returns hex chain ID",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ openBrowser: false, defaultChainId: 137 });
    const client = createTestClient(signer);
    const chainId = await client.request({ method: "eth_chainId" });
    assertEquals(chainId, "0x89");
  },
});

Deno.test({
  name: "walletSignerTransport: throws for unknown method without rpcUrl",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ openBrowser: false, defaultChainId: 99999 });
    const client = createTestClient(signer);
    await assertRejects(
      // deno-lint-ignore no-explicit-any
      () => (client as any).request({ method: "eth_blockNumber", params: [] }),
      Error,
      "No RPC URL",
    );
  },
});
