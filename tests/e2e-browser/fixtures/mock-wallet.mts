/**
 * Mock wallet provider for Playwright e2e tests.
 *
 * Generates a script that creates a mock `window.ethereum` in the browser.
 * The mock returns fake signatures/hashes since we're testing UI flow.
 */

// Test account (Anvil default account #0)
export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const TEST_CHAIN_ID = 1;

/**
 * Generate the mock provider script to inject into the browser.
 */
export function getMockProviderScript(address: string, chainId: number): string {
  return `
(function() {
  const TEST_ADDRESS = "${address}";
  const TEST_CHAIN_ID = ${chainId};

  function toHex(num) {
    return "0x" + num.toString(16);
  }

  function fakeHash(prefix) {
    return "0x" + prefix.repeat(32);
  }

  function fakeSignature(prefix) {
    return "0x" + prefix.repeat(65);
  }

  const handlers = {
    eth_requestAccounts: async () => {
      console.log("[MockWallet] eth_requestAccounts -> " + TEST_ADDRESS);
      return [TEST_ADDRESS];
    },
    eth_accounts: async () => {
      console.log("[MockWallet] eth_accounts -> " + TEST_ADDRESS);
      return [TEST_ADDRESS];
    },
    eth_chainId: async () => {
      const hex = toHex(TEST_CHAIN_ID);
      console.log("[MockWallet] eth_chainId -> " + hex);
      return hex;
    },
    wallet_switchEthereumChain: async (params) => {
      console.log("[MockWallet] wallet_switchEthereumChain:", params);
      return null;
    },
    wallet_addEthereumChain: async (params) => {
      console.log("[MockWallet] wallet_addEthereumChain:", params);
      return null;
    },
    eth_sendTransaction: async (params) => {
      const tx = params[0];
      console.log("[MockWallet] eth_sendTransaction:", tx);
      const hash = fakeHash("ab");
      return hash;
    },
    personal_sign: async (params) => {
      console.log("[MockWallet] personal_sign:", params);
      const sig = fakeSignature("cd");
      return sig;
    },
    eth_signTypedData_v4: async (params) => {
      console.log("[MockWallet] eth_signTypedData_v4:", params);
      const sig = fakeSignature("ef");
      return sig;
    },
    eth_getBalance: async () => "0x8AC7230489E80000",
    eth_estimateGas: async () => "0x5208",
    eth_gasPrice: async () => "0x3B9ACA00",
    net_version: async () => String(TEST_CHAIN_ID),
  };

  window.ethereum = {
    isMetaMask: true,
    _isMockProvider: true,
    selectedAddress: TEST_ADDRESS,
    chainId: toHex(TEST_CHAIN_ID),
    networkVersion: String(TEST_CHAIN_ID),

    request: async ({ method, params }) => {
      console.log("[MockWallet] request:", method);
      const handler = handlers[method];
      if (handler) {
        try {
          return await handler(params || []);
        } catch (err) {
          console.error("[MockWallet] Error:", method, err);
          throw err;
        }
      }
      console.warn("[MockWallet] Unhandled:", method);
      throw new Error("Method not supported: " + method);
    },

    on: (event, cb) => {
      if (!window.ethereum._listeners) window.ethereum._listeners = {};
      if (!window.ethereum._listeners[event]) window.ethereum._listeners[event] = [];
      window.ethereum._listeners[event].push(cb);
    },

    removeListener: (event, cb) => {
      if (window.ethereum._listeners?.[event]) {
        const idx = window.ethereum._listeners[event].indexOf(cb);
        if (idx !== -1) window.ethereum._listeners[event].splice(idx, 1);
      }
    },

    _listeners: {},

    enable: async () => [TEST_ADDRESS],
  };

  console.log("[MockWallet] Injected at " + TEST_ADDRESS);
})();
`;
}
