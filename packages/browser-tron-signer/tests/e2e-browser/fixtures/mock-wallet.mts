/**
 * Mock TronLink provider for Playwright e2e tests.
 *
 * TronLink injects two globals on page load:
 *   window.tronLink — has `request({method: "tron_requestAccounts"})` returning {code: 200|4001}
 *   window.tronWeb  — has defaultAddress.base58, fullNode.host, transactionBuilder.*, trx.*
 *
 * This mock fakes both with canned tx ids and signatures since we're testing UI flow,
 * not real chain submission.
 */

// Anvil-style canned address (any valid TRON Base58 works for UI tests).
export const TEST_ADDRESS = "TLPpXqj1z2gqg7Zr3LK1xJ9XJDgSnE4DAS";
export const TEST_NETWORK = "mainnet";
export const TEST_NODE_HOST = "https://api.trongrid.io";

export const FAKE_TX_ID = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
export const FAKE_SIGNATURE = "0x" + "cd".repeat(65);
export const FAKE_TYPED_SIGNATURE = "0x" + "ef".repeat(65);

// The deploy flow reads contract_address from createSmartContract's result and converts it via
// tw.address.fromHex(). Both halves of that pair are mocked to canned values.
export const FAKE_CONTRACT_HEX = "41" + "ab".repeat(20);
export const FAKE_CONTRACT_BASE58 = "TDeployedMockContract000000000000XYZ";

export interface MockTronLinkOptions {
  address?: string;
  /** When true, requestAccounts returns {code: 4001} simulating user rejection. */
  rejectConnect?: boolean;
  /** When true, trx.sign throws — simulates the user clicking reject inside TronLink. */
  rejectSign?: boolean;
}

/**
 * Generate the mock provider script to inject into the browser via addInitScript.
 *
 * We attach the mocks under window.__tronLinkMock and synchronously assign window.tronWeb /
 * window.tronLink to them. The index.html calls waitForTronWeb() with a 1.5s deadline; by
 * setting these synchronously in addInitScript, they're already present before init() runs.
 */
export function getMockProviderScript(options?: MockTronLinkOptions): string {
  const address = options?.address ?? TEST_ADDRESS;
  const rejectConnect = options?.rejectConnect ?? false;
  const rejectSign = options?.rejectSign ?? false;

  return `
(function() {
  const ADDRESS = ${JSON.stringify(address)};
  const REJECT_CONNECT = ${rejectConnect};
  const REJECT_SIGN = ${rejectSign};
  const FAKE_TX_ID = ${JSON.stringify(FAKE_TX_ID)};
  const FAKE_SIGNATURE = ${JSON.stringify(FAKE_SIGNATURE)};
  const FAKE_TYPED_SIGNATURE = ${JSON.stringify(FAKE_TYPED_SIGNATURE)};
  const FAKE_CONTRACT_HEX = ${JSON.stringify(FAKE_CONTRACT_HEX)};
  const FAKE_CONTRACT_BASE58 = ${JSON.stringify(FAKE_CONTRACT_BASE58)};

  const tronWeb = {
    defaultAddress: { base58: ADDRESS, hex: "41" + "00".repeat(20), name: false },
    fullNode: { host: ${JSON.stringify(TEST_NODE_HOST)} },

    transactionBuilder: {
      async sendTrx(to, amount, from) {
        console.log("[MockTronWeb] sendTrx:", to, amount, from);
        return {
          txID: FAKE_TX_ID,
          raw_data: { contract: [{ type: "TransferContract", parameter: { value: { to_address: to, amount, owner_address: from } } }] },
          raw_data_hex: "deadbeef",
        };
      },
      async triggerSmartContract(contract, functionSelector, options, parameters, from) {
        console.log("[MockTronWeb] triggerSmartContract:", contract, functionSelector, options, parameters, from);
        return {
          result: { result: true },
          transaction: {
            txID: FAKE_TX_ID,
            raw_data: {
              contract: [{
                type: "TriggerSmartContract",
                parameter: { value: { contract_address: contract, function_selector: functionSelector, parameter: parameters, owner_address: from } },
              }],
            },
            raw_data_hex: "deadbeef",
          },
        };
      },
      async createSmartContract(options, ownerAddress) {
        console.log("[MockTronWeb] createSmartContract:", options && options.name, ownerAddress);
        return {
          txID: FAKE_TX_ID,
          contract_address: FAKE_CONTRACT_HEX,
          raw_data: {
            contract: [{
              type: "CreateSmartContract",
              parameter: { value: { new_contract: { contract_address: FAKE_CONTRACT_HEX, abi: options.abi, bytecode: options.bytecode } } },
            }],
          },
          raw_data_hex: "deadbeef",
        };
      },
    },

    address: {
      fromHex(hex) {
        console.log("[MockTronWeb] address.fromHex:", hex);
        // Real conversion isn't needed for UI tests — return our canned Base58 value.
        return FAKE_CONTRACT_BASE58;
      },
    },

    trx: {
      async sign(unsignedTx) {
        console.log("[MockTronWeb] sign:", unsignedTx && unsignedTx.txID);
        if (REJECT_SIGN) throw new Error("User rejected the transaction");
        return Object.assign({}, unsignedTx, { signature: ["fake-signature-hex"] });
      },
      async sendRawTransaction(signedTx) {
        console.log("[MockTronWeb] sendRawTransaction:", signedTx && signedTx.txID);
        return { result: true, transaction: signedTx, txid: signedTx.txID };
      },
      async signMessageV2(message) {
        console.log("[MockTronWeb] signMessageV2:", message);
        if (REJECT_SIGN) throw new Error("User rejected message signing");
        return FAKE_SIGNATURE;
      },
      async _signTypedData(domain, types, message) {
        console.log("[MockTronWeb] _signTypedData:", JSON.stringify({domain, types, message}));
        if (REJECT_SIGN) throw new Error("User rejected typed-data signing");
        return FAKE_TYPED_SIGNATURE;
      },
    },
  };

  const tronLink = {
    ready: true,
    tronWeb: tronWeb,
    async request({ method }) {
      console.log("[MockTronLink] request:", method);
      if (method === "tron_requestAccounts") {
        if (REJECT_CONNECT) return { code: 4001, message: "User rejected" };
        return { code: 200, message: "ok" };
      }
      return { code: 4200, message: "Method not supported: " + method };
    },
  };

  window.tronLink = tronLink;
  window.tronWeb = tronWeb;

  console.log("[MockTronLink] Injected at " + ADDRESS);
})();
`;
}
