// Wallet interactions using viem and window.ethereum

import {
  createWalletClient,
  custom,
  type WalletClient,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { mainnet, sepolia, polygon, arbitrum, optimism, base, avalanche, bsc } from "viem/chains";

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

// Ethereum provider interface (window.ethereum)
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Check if a browser wallet is available
 */
export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

/**
 * Get the wallet name (if detectable)
 */
export function getWalletName(): string {
  if (!window.ethereum) return "Unknown";
  if (window.ethereum.isMetaMask) return "MetaMask";
  return "Browser Wallet";
}

/**
 * Create a viem wallet client for the given chain
 */
function createClient(chainId: number): WalletClient {
  const chain = CHAINS[chainId] || mainnet;
  return createWalletClient({
    chain,
    transport: custom(window.ethereum!),
  });
}

/**
 * Request wallet connection and return the connected address
 */
export async function connectWallet(chainId?: number): Promise<Address> {
  if (!window.ethereum) {
    throw new Error("No wallet detected. Please install MetaMask or another browser wallet.");
  }

  // Request accounts
  const accounts = (await window.ethereum.request({
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
  if (!window.ethereum) {
    return [];
  }

  const accounts = (await window.ethereum.request({
    method: "eth_accounts",
  })) as Address[];

  return accounts || [];
}

/**
 * Switch to a different chain
 */
export async function switchChain(chainId: number): Promise<void> {
  if (!window.ethereum) {
    throw new Error("No wallet detected");
  }

  const hexChainId = `0x${chainId.toString(16)}`;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (error: unknown) {
    // Chain not added to wallet - try to add it
    if ((error as { code?: number })?.code === 4902) {
      const chain = CHAINS[chainId];
      if (chain) {
        await window.ethereum.request({
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
  if (!window.ethereum) {
    throw new Error("No wallet detected");
  }

  const hexChainId = (await window.ethereum.request({
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
