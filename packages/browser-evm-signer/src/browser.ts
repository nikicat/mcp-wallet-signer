/**
 * Open a URL in the default browser
 */
export async function openBrowser(url: string): Promise<void> {
  try {
    // Dynamic import: avoids pulling in `open` (and its `is-wsl` dep) at module load time,
    // which matters when a consumer provides a custom openBrowser and never needs this default.
    const { default: open } = await import("open");
    await open(url);
  } catch (error) {
    // Log error but don't throw - the user might want to open the URL manually
    console.error(`[mcp-wallet-signer] Failed to open browser: ${error}`);
    console.error(`[mcp-wallet-signer] Please open this URL manually: ${url}`);
  }
}

/**
 * Build the URL for a specific signing request
 */
export function buildSignUrl(port: number, requestId: string): string {
  return `http://127.0.0.1:${port}/sign/${requestId}`;
}

/**
 * Build the URL for wallet connection
 */
export function buildConnectUrl(port: number, requestId: string): string {
  return `http://127.0.0.1:${port}/connect/${requestId}`;
}
