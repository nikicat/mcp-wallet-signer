/**
 * What the shim puts on the control-API wire, against a fake `serve` that echoes it back.
 * This is the part a compatibility shim can silently get wrong.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { CHAINS, getDefaultChainId, getPort, WalletSigner, WrongWalletAddressError } from "../src/index.ts";

const FAKE_SERVE = fileURLToPath(new URL("./fake-serve.mjs", import.meta.url));

describe("WalletSigner over a fake bridge", () => {
  let signer: WalletSigner;

  before(() => {
    process.env.BROWSER_WEB3_SIGNER_BIN = FAKE_SERVE;
    signer = new WalletSigner({ defaultChainId: 8453, openBrowser: false });
  });

  after(async () => {
    await signer.shutdown();
  });

  test("connect sends the default chain id", async () => {
    const { address, approvalUrl } = await signer.connectWallet();
    assert.deepEqual(JSON.parse(address), { type: "connect", chainId: 8453 });
    assert.match(approvalUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("sendTransaction keeps the EVM field names", async () => {
    const { txHash } = await signer.sendTransaction({ to: "0xabc", value: "1000", data: "0xdd" });
    assert.deepEqual(JSON.parse(txHash), {
      type: "send_transaction",
      to: "0xabc",
      value: "1000",
      data: "0xdd",
      chainId: 8453,
    });
  });

  test("an explicit chainId wins over the default", async () => {
    const { signature } = await signer.signMessage({ message: "hi", chainId: 1 });
    assert.deepEqual(JSON.parse(signature), { type: "sign_message", message: "hi", chainId: 1 });
  });

  test("signTypedData forwards the EIP-712 payload", async () => {
    const { signature } = await signer.signTypedData({
      domain: { name: "Test" },
      types: { Mail: [{ name: "from", type: "address" }] },
      primaryType: "Mail",
      message: { from: "0xabc" },
    });
    assert.equal(JSON.parse(signature).primaryType, "Mail");
  });

  test("a wrong-wallet rejection keeps its type", async () => {
    await assert.rejects(
      signer.sendTransaction({ to: "__reject__" }),
      (err: unknown) => err instanceof WrongWalletAddressError && err.message === "wrong account",
    );
  });
});

describe("config compatibility", () => {
  test("chain table and env-driven defaults survive", () => {
    assert.equal(CHAINS[8453]?.name, "Base");
    assert.equal(getDefaultChainId(), 1);
    assert.equal(getPort(), 3847);
  });
});
