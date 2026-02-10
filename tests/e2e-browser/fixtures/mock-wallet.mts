/**
 * Mock wallet provider for Playwright e2e tests.
 *
 * Generates a script that creates a mock wallet in the browser,
 * announcing it via EIP-6963 events and setting window.ethereum as fallback.
 * The mock returns fake signatures/hashes since we're testing UI flow.
 */

// Test account (Anvil default account #0)
export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const TEST_CHAIN_ID = 1;

// EIP-6963 identity
export const TEST_WALLET_NAME = "MockWallet";
export const TEST_WALLET_RDNS = "test.mockwallet";

export interface MockWalletOptions {
  name?: string;
  rdns?: string;
}

/**
 * Generate the mock provider script to inject into the browser.
 *
 * Sets up both:
 * 1. EIP-6963 announcements (primary — mipd store picks these up)
 * 2. window.ethereum fallback (legacy path)
 */
export function getMockProviderScript(
  address: string,
  chainId: number,
  options?: MockWalletOptions,
): string {
  const name = options?.name ?? TEST_WALLET_NAME;
  const rdns = options?.rdns ?? TEST_WALLET_RDNS;

  return `
(function() {
  const TEST_ADDRESS = "${address}";
  const TEST_CHAIN_ID = ${chainId};
  const WALLET_NAME = "${name}";
  const WALLET_RDNS = "${rdns}";

  function toHex(num) {
    return "0x" + num.toString(16);
  }

  function fakeHash(prefix) {
    return "0x" + prefix.repeat(32);
  }

  function fakeSignature(prefix) {
    return "0x" + prefix.repeat(65);
  }

  // Build an SVG icon as data URI
  const WALLET_ICON = "data:image/svg+xml;base64," + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect fill="#6366f1" width="32" height="32" rx="6"/></svg>'
  );

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

  // Build the EIP-1193 provider object
  const provider = {
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
      if (!provider._listeners) provider._listeners = {};
      if (!provider._listeners[event]) provider._listeners[event] = [];
      provider._listeners[event].push(cb);
    },

    removeListener: (event, cb) => {
      if (provider._listeners?.[event]) {
        const idx = provider._listeners[event].indexOf(cb);
        if (idx !== -1) provider._listeners[event].splice(idx, 1);
      }
    },

    _listeners: {},

    enable: async () => [TEST_ADDRESS],
  };

  // Legacy fallback — set window.ethereum (no isMetaMask flag so we can
  // verify the name comes from EIP-6963, not from the legacy detection).
  window.ethereum = provider;

  // --- EIP-6963 wallet announcement ---
  const providerDetail = Object.freeze({
    info: Object.freeze({
      uuid: crypto.randomUUID(),
      name: WALLET_NAME,
      icon: WALLET_ICON,
      rdns: WALLET_RDNS,
    }),
    provider: provider,
  });

  function announceProvider() {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: providerDetail,
      })
    );
  }

  // Announce immediately so any store already listening picks it up
  announceProvider();

  // Re-announce whenever a dapp requests providers
  window.addEventListener("eip6963:requestProvider", () => {
    console.log("[MockWallet] Received eip6963:requestProvider, re-announcing...");
    announceProvider();
  });

  console.log("[MockWallet] Injected " + WALLET_NAME + " at " + TEST_ADDRESS + " (EIP-6963 + legacy)");
})();
`;
}
