/**
 * What the shim puts on the control-API wire, against a fake `serve` that echoes it back.
 * TRON's field names differ from EVM's (`amount`/`network`, not `value`/`chainId`), which is
 * exactly the kind of thing a shim gets wrong silently.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { getDefaultNetwork, getFullHost, NETWORKS, WalletSigner, WrongWalletAddressError } from "../src/index.ts";

const FAKE_SERVE = fileURLToPath(new URL("./fake-serve.mjs", import.meta.url));

describe("WalletSigner over a fake bridge", () => {
  let signer: WalletSigner;

  before(() => {
    process.env.BROWSER_WEB3_SIGNER_BIN = FAKE_SERVE;
    signer = new WalletSigner({ defaultNetwork: "nile", openBrowser: false });
  });

  after(async () => {
    await signer.shutdown();
  });

  test("connect sends the default network", async () => {
    const { address } = await signer.connectWallet();
    assert.deepEqual(JSON.parse(address), { type: "connect", network: "nile" });
  });

  test("sendTransaction sends amount + network, not value + chainId", async () => {
    const { txHash } = await signer.sendTransaction({ to: "TRecipient", amount: "1000000" });
    assert.deepEqual(JSON.parse(txHash), {
      type: "send_transaction",
      to: "TRecipient",
      amount: "1000000",
      network: "nile",
    });
  });

  test("triggerContract forwards the selector and parameters", async () => {
    const { txHash } = await signer.triggerContract({
      contractAddress: "TToken",
      functionSelector: "transfer(address,uint256)",
      parameters: [{ type: "address", value: "TRecipient" }],
      network: "shasta",
    });
    assert.deepEqual(JSON.parse(txHash), {
      type: "trigger_contract",
      contractAddress: "TToken",
      functionSelector: "transfer(address,uint256)",
      parameters: [{ type: "address", value: "TRecipient" }],
      network: "shasta",
    });
  });

  test("deployContract parses the JSON result into fields", async () => {
    const { txHash, contractAddress } = await signer.deployContract({ abi: [], bytecode: "0x60" });
    assert.equal(txHash, "0xdeadbeef");
    assert.equal(contractAddress, "TDeployed");
  });

  test("signMessage and signTypedData carry the network", async () => {
    const { signature } = await signer.signMessage({ message: "hi" });
    assert.deepEqual(JSON.parse(signature), { type: "sign_message", message: "hi", network: "nile" });

    const typed = await signer.signTypedData({
      domain: { name: "Test" },
      types: { Mail: [{ name: "from", type: "address" }] },
      primaryType: "Mail",
      message: { from: "TSender" },
    });
    assert.equal(JSON.parse(typed.signature).network, "nile");
  });

  test("a wrong-wallet rejection keeps its type", async () => {
    await assert.rejects(
      signer.sendTransaction({ to: "__reject__", amount: "1" }),
      (err: unknown) => err instanceof WrongWalletAddressError,
    );
  });
});

describe("config compatibility", () => {
  test("network table and env-driven defaults survive", () => {
    assert.equal(NETWORKS.nile.name, "Nile Testnet");
    assert.equal(getFullHost("shasta"), "https://api.shasta.trongrid.io");
    assert.equal(getDefaultNetwork(), "mainnet");
  });
});
