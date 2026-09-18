import process from "node:process";

import type { ChainConfig } from "./types.ts";

/**
 * The port the pre-0.3.1 HTTP bridge listened on. The Rust bridge picks its own free port, so
 * this is kept only so that `import { DEFAULT_PORT }` still resolves.
 */
export const DEFAULT_PORT = 3847;

/**
 * Get the HTTP server port from `EVM_MCP_PORT`, falling back to {@linkcode DEFAULT_PORT}.
 *
 * Kept for source compatibility — the Rust bridge binds its own free port and ignores this.
 */
export function getPort(): number {
  const parsed = parseInt(process.env.EVM_MCP_PORT ?? "", 10);
  return !isNaN(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

/** Get the default chain ID from `EVM_MCP_DEFAULT_CHAIN` env var, falling back to Ethereum mainnet (1). */
export function getDefaultChainId(): number {
  const envChain = process.env.EVM_MCP_DEFAULT_CHAIN;
  if (envChain) {
    const parsed = parseInt(envChain, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

/** Built-in chain configurations keyed by chain ID (Ethereum, Polygon, Arbitrum, etc.). */
export const CHAINS: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    id: 1,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://etherscan.io",
  },
  // Sepolia Testnet
  11155111: {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://sepolia.etherscan.io",
  },
  // Polygon
  137: {
    id: 137,
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    blockExplorer: "https://polygonscan.com",
  },
  // Arbitrum One
  42161: {
    id: 42161,
    name: "Arbitrum One",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://arbiscan.io",
  },
  // Optimism
  10: {
    id: 10,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://optimistic.etherscan.io",
  },
  // Base
  8453: {
    id: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://basescan.org",
  },
  // Avalanche C-Chain
  43114: {
    id: 43114,
    name: "Avalanche",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
    blockExplorer: "https://snowtrace.io",
  },
  // BNB Smart Chain
  56: {
    id: 56,
    name: "BNB Smart Chain",
    rpcUrl: "https://bsc-dataseed.binance.org",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    blockExplorer: "https://bscscan.com",
  },
};

/** Look up a {@linkcode ChainConfig} by chain ID, returning `undefined` for unknown chains. */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId];
}

/** Get the JSON-RPC endpoint URL for a chain, or `undefined` if the chain is not in {@linkcode CHAINS}. */
export function getRpcUrl(chainId: number): string | undefined {
  return CHAINS[chainId]?.rpcUrl;
}
