// Wallet interactions using viem and EIP-6963 wallet discovery (via mipd)

import {
  createWalletClient,
  custom,
  type WalletClient,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { mainnet, sepolia, polygon, arbitrum, optimism, base, avalanche, bsc } from "viem/chains";
import { createStore, type EIP6963ProviderDetail } from "mipd";

// Chain ID to viem chain mapping
const CHAINS: Record<number, typeof mainnet> = {
  1: mainnet,
  11155111: sepolia,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
  43114: avalanche,
  56: bsc,
};

// EIP-6963 provider store — discovers wallets via standardized events.
// Lazily initialized on first access to ensure browser init scripts
// (e.g. Playwright mock wallets) have run before mipd dispatches
// its eip6963:requestProvider event.
let _store: ReturnType<typeof createStore> | null = null;

function getStore(): ReturnType<typeof createStore> | null {
  if (_store === null && typeof window !== "undefined") {
    _store = createStore();
  }
  return _store;
}

/**
 * Get the first EIP-6963 provider detail, or null
 */
function getProviderDetail(): EIP6963ProviderDetail | null {
  const providers = getStore()?.getProviders() ?? [];
  return providers.length > 0 ? providers[0] : null;
}

/**
 * Get an EIP-1193 provider (EIP-6963 first, window.ethereum fallback)
 */
function getProvider() {
  const detail = getProviderDetail();
  if (detail) return detail.provider;
  // deno-lint-ignore no-explicit-any
  return (window as any).ethereum ?? null;
}

/**
 * Check if a browser wallet is available
 */
export function hasWallet(): boolean {
  return typeof window !== "undefined" && getProvider() !== null;
}

/**
 * Get the wallet name (if detectable)
 */
export function getWalletName(): string {
  const detail = getProviderDetail();
  if (detail) return detail.info.name;
  // deno-lint-ignore no-explicit-any
  const eth = (window as any).ethereum;
  if (!eth) return "Unknown";
  if (eth.isMetaMask) return "MetaMask";
  return "Browser Wallet";
}

/**
 * Get the wallet icon as a data URI, or null if unavailable
 */
export function getWalletIcon(): string | null {
  const detail = getProviderDetail();
  return detail?.info.icon ?? null;
}

/**
 * Create a viem wallet client for the given chain
 */
function createClient(chainId: number): WalletClient {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet detected");
  const chain = CHAINS[chainId] || mainnet;
  return createWalletClient({
    chain,
    transport: custom(provider),
  });
}

/**
 * Request wallet connection and return the connected address
 */
export async function connectWallet(chainId?: number): Promise<Address> {
  const provider = getProvider();
  if (!provider) {
    throw new Error("No wallet detected. Please install a browser wallet to continue.");
  }

  // Request accounts
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as Address[];

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts returned from wallet");
  }

  // Switch to requested chain if specified
  if (chainId) {
    await switchChain(chainId);
  }

  return accounts[0];
}

/**
 * Get currently connected accounts (without prompting)
 */
export async function getAccounts(): Promise<Address[]> {
  const provider = getProvider();
  if (!provider) return [];

  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as Address[];

  return accounts || [];
}

/**
 * Switch to a different chain
 */
export async function switchChain(chainId: number): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet detected");

  const hexChainId = `0x${chainId.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (error: unknown) {
    // Chain not added to wallet - try to add it
    if ((error as { code?: number })?.code === 4902) {
      const chain = CHAINS[chainId];
      if (chain) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChainId,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [chain.rpcUrls.default.http[0]],
              blockExplorerUrls: chain.blockExplorers
                ? [chain.blockExplorers.default.url]
                : undefined,
            },
          ],
        });
      } else {
        throw new Error(`Unknown chain ID: ${chainId}`);
      }
    } else {
      throw error;
    }
  }
}

/**
 * Get the current chain ID
 */
export async function getChainId(): Promise<number> {
  const provider = getProvider();
  if (!provider) throw new Error("No wallet detected");

  const hexChainId = (await provider.request({
    method: "eth_chainId",
  })) as string;

  return parseInt(hexChainId, 16);
}

/**
 * Send a transaction
 */
export async function sendTransaction(params: {
  to: Address;
  value?: bigint;
  data?: Hex;
  chainId: number;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}): Promise<Hash> {
  const client = createClient(params.chainId);
  const accounts = await getAccounts();

  if (accounts.length === 0) {
    throw new Error("No connected account");
  }

  const hash = await client.sendTransaction({
    account: accounts[0],
    to: params.to,
    value: params.value,
    data: params.data,
    gas: params.gasLimit,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
  });

  return hash;
}

/**
 * Sign a message using personal_sign
 */
export async function signMessage(params: {
  message: string;
  address?: Address;
  chainId: number;
}): Promise<Hex> {
  const client = createClient(params.chainId);
  const accounts = await getAccounts();

  const address = params.address || accounts[0];
  if (!address) {
    throw new Error("No connected account");
  }

  const signature = await client.signMessage({
    account: address,
    message: params.message,
  });

  return signature;
}

/**
 * Sign EIP-712 typed data
 */
export async function signTypedData(params: {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
    salt?: Hex;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
  address?: Address;
  chainId: number;
}): Promise<Hex> {
  const client = createClient(params.chainId);
  const accounts = await getAccounts();

  const address = params.address || accounts[0];
  if (!address) {
    throw new Error("No connected account");
  }

  const signature = await client.signTypedData({
    account: address,
    domain: params.domain,
    types: params.types,
    primaryType: params.primaryType,
    message: params.message,
  });

  return signature;
}
