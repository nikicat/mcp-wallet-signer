import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findWrongWalletAddressError, WrongWalletAddressError } from "../src/mod.ts";
import { WalletSigner } from "../src/wallet-signer.ts";

Deno.test("WalletSigner: constructor uses defaults", () => {
  const signer = new WalletSigner({ openBrowser: false });
  assertEquals(signer.defaultNetwork, "mainnet");
  assertEquals(signer.port, null);
  assertExists(signer.pendingStore);
});

Deno.test("WalletSigner: constructor accepts options", () => {
  const signer = new WalletSigner({ port: 4000, defaultNetwork: "shasta", openBrowser: false });
  assertEquals(signer.defaultNetwork, "shasta");
  assertEquals(signer.port, null);
});

Deno.test({
  name: "WalletSigner: start() launches HTTP server",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      const port = await signer.start();
      assertEquals(signer.port, port);
      assertEquals(typeof port, "number");

      const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
      assertEquals(resp.status, 200);
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "WalletSigner: connectWallet round-trips via HTTP",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;

      const connectPromise = signer.connectWallet();
      await new Promise((r) => setTimeout(r, 0));

      const ids = signer.pendingStore.getPendingIds();
      assertEquals(ids.length, 1);

      const resp = await fetch(`http://127.0.0.1:${port}/api/complete/${ids[0]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS" }),
      });
      assertEquals(resp.status, 200);

      const { address, approvalUrl } = await connectPromise;
      assertEquals(address, "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS");
      assertExists(approvalUrl);
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "WalletSigner: sendTransaction surfaces tx hash",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;

      const txPromise = signer.sendTransaction({ to: "TRecipient", amount: "1000000" });
      await new Promise((r) => setTimeout(r, 0));
      const [id] = signer.pendingStore.getPendingIds();
      const req = signer.pendingStore.get(id);
      assertExists(req);
      if (req.type === "send_transaction") {
        assertEquals(req.to, "TRecipient");
        assertEquals(req.amount, "1000000");
        assertEquals(req.network, "mainnet");
      }

      await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "abc-tx-hash" }),
      });

      const { txHash } = await txPromise;
      assertEquals(txHash, "abc-tx-hash");
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "WalletSigner: WRONG_WALLET_ADDRESS code throws WrongWalletAddressError",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;

      let caught: unknown;
      const promise = signer.sendTransaction({ to: "TRecipient", amount: "1000000" })
        .catch((e) => {
          caught = e;
        });
      await new Promise((r) => setTimeout(r, 0));
      const [id] = signer.pendingStore.getPendingIds();

      await fetch(`http://127.0.0.1:${port}/api/complete/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Wrong wallet address: expected Taaa, got Tbbb",
          code: "WRONG_WALLET_ADDRESS",
        }),
      });

      await promise;
      assertInstanceOf(caught, WrongWalletAddressError);
      assertExists(findWrongWalletAddressError(caught));
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "WalletSigner: shutdown cancels pending requests",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();

      let caught: Error | undefined;
      const promise = signer.connectWallet().catch((e) => {
        caught = e;
      });
      await new Promise((r) => setTimeout(r, 0));
      assertEquals(signer.pendingStore.size, 1);

      await signer.shutdown();
      assertEquals(signer.port, null);

      await promise;
      assertExists(caught);
      assertExists(caught!.message.match(/shutting down/));
    } finally {
      await signer.shutdown();
    }
  },
});
