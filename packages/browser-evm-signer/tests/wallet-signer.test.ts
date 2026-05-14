import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findWrongWalletAddressError, WrongWalletAddressError } from "../src/errors.ts";
import { WalletSigner } from "../src/wallet-signer.ts";

Deno.test("WalletSigner: constructor uses defaults", () => {
  const signer = new WalletSigner({ openBrowser: false });
  assertEquals(signer.defaultChainId, 1);
  assertEquals(signer.port, null);
  assertExists(signer.pendingStore);
});

Deno.test("WalletSigner: constructor accepts options", () => {
  const signer = new WalletSigner({ port: 4000, defaultChainId: 137, openBrowser: false });
  assertEquals(signer.defaultChainId, 137);
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

      // Health check
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
      // Let connectWallet progress past its internal awaits to create the pending request
      await new Promise((r) => setTimeout(r, 0));

      const ids = signer.pendingStore.getPendingIds();
      assertEquals(ids.length, 1);

      const resp = await fetch(`http://127.0.0.1:${port}/api/complete/${ids[0]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "0xabc123" }),
      });
      assertEquals(resp.status, 200);

      const { address, approvalUrl } = await connectPromise;
      assertEquals(address, "0xabc123");
      assertExists(approvalUrl);
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "WalletSigner: custom openBrowser callback receives URL",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const urls: string[] = [];
    const signer = new WalletSigner({
      port: 0,
      openBrowser: (url) => {
        urls.push(url);
      },
    });
    try {
      await signer.start();

      const connectPromise = signer.connectWallet();
      await new Promise((r) => setTimeout(r, 0));

      assertEquals(urls.length, 1);
      assertExists(urls[0].match(/\/connect\//));

      const ids = signer.pendingStore.getPendingIds();
      const resp = await fetch(`http://127.0.0.1:${signer.port}/api/complete/${ids[0]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, result: "0xdef456" }),
      });
      assertEquals(resp.status, 200);
      await connectPromise;
    } finally {
      await signer.shutdown();
    }
  },
});

Deno.test({
  name: "WalletSigner: failed request throws",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    try {
      await signer.start();
      const port = signer.port!;

      // Suppress uncaught rejection — we check the error below
      let caught: Error | undefined;
      const connectPromise = signer.connectWallet().catch((e) => {
        caught = e;
      });
      await new Promise((r) => setTimeout(r, 0));
      const ids = signer.pendingStore.getPendingIds();

      await fetch(`http://127.0.0.1:${port}/api/complete/${ids[0]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "User rejected" }),
      });

      await connectPromise;
      assertExists(caught);
      assertExists(caught!.message.match(/User rejected/));
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
      const promise = signer.sendTransaction({ to: "0x0000000000000000000000000000000000000001" })
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
          error: "Wrong wallet address: expected 0xaaa, got 0xbbb",
          code: "WRONG_WALLET_ADDRESS",
        }),
      });

      await promise;
      assertInstanceOf(caught, WrongWalletAddressError);
      assertExists(findWrongWalletAddressError(caught));
      // And it survives one level of wrapping via `cause`:
      const wrapped = new Error("outer", { cause: caught });
      assertExists(findWrongWalletAddressError(wrapped));
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

Deno.test({
  name: "WalletSigner: shutdown is idempotent",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const signer = new WalletSigner({ port: 0, openBrowser: false });
    await signer.shutdown();
    await signer.shutdown();
  },
});
