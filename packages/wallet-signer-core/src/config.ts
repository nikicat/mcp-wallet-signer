import process from "node:process";

/** Default HTTP server port. */
export const DEFAULT_PORT = 3847;

/**
 * Read a port from the given environment variable, falling back to `defaultPort`.
 * Used by chain-specific packages: EVM reads `EVM_MCP_PORT`, TRON reads `TRON_MCP_PORT`, etc.
 */
export function getPortFromEnv(envName: string, defaultPort: number = DEFAULT_PORT): number {
  const env = process.env[envName];
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return defaultPort;
}
