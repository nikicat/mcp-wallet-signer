import process from "node:process";

import { DEFAULT_PORT, getPortFromEnv } from "wallet-signer-core";

import type { NetworkConfig, TronNetwork } from "./types.ts";

/** Default HTTP port for the TRON signing UI (separate from the EVM signer's 3847). */
export const DEFAULT_TRON_PORT = 3848;

/** Get the HTTP server port from `TRON_MCP_PORT` env var, falling back to {@linkcode DEFAULT_TRON_PORT}. */
export function getPort(): number {
  return getPortFromEnv("TRON_MCP_PORT", DEFAULT_TRON_PORT);
}

/** Get the default network from `TRON_MCP_DEFAULT_NETWORK` env var, falling back to mainnet. */
export function getDefaultNetwork(): TronNetwork {
  const envNet = process.env.TRON_MCP_DEFAULT_NETWORK?.toLowerCase();
  if (envNet === "shasta" || envNet === "nile" || envNet === "mainnet") return envNet;
  return "mainnet";
}

/** Built-in network configurations keyed by network id. */
export const NETWORKS: Record<TronNetwork, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "Tron Mainnet",
    fullHost: "https://api.trongrid.io",
    blockExplorer: "https://tronscan.org",
    nativeCurrency: { name: "Tronix", symbol: "TRX", decimals: 6 },
  },
  shasta: {
    id: "shasta",
    name: "Shasta Testnet",
    fullHost: "https://api.shasta.trongrid.io",
    blockExplorer: "https://shasta.tronscan.org",
    nativeCurrency: { name: "Tronix", symbol: "TRX", decimals: 6 },
  },
  nile: {
    id: "nile",
    name: "Nile Testnet",
    fullHost: "https://nile.trongrid.io",
    blockExplorer: "https://nile.tronscan.org",
    nativeCurrency: { name: "Tronix", symbol: "TRX", decimals: 6 },
  },
};

/** Look up a {@linkcode NetworkConfig} by id, returning `undefined` for unknown networks. */
export function getNetworkConfig(network: TronNetwork): NetworkConfig | undefined {
  return NETWORKS[network];
}

/** Get the TronGrid full-node URL for a network. */
export function getFullHost(network: TronNetwork): string | undefined {
  return NETWORKS[network]?.fullHost;
}

// Re-export the shared default so callers depending on this symbol still work.
export { DEFAULT_PORT };
