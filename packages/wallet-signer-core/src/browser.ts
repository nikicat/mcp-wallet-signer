/**
 * Open a URL in the default browser. Failures are logged, not thrown — the user may
 * choose to open the URL manually.
 */
export async function openBrowser(url: string): Promise<void> {
  try {
    // Dynamic import: avoids pulling in `open` (and its `is-wsl` dep) at module load time,
    // which matters when a consumer provides a custom openBrowser and never needs this default.
    const { default: open } = await import("open");
    await open(url);
  } catch (error) {
    console.error(`[wallet-signer-core] Failed to open browser: ${error}`);
    console.error(`[wallet-signer-core] Please open this URL manually: ${url}`);
  }
}

/** Build the URL for a specific signing request. Path prefix matches the in-page router. */
export function buildSignUrl(port: number, requestId: string): string {
  return `http://127.0.0.1:${port}/sign/${requestId}`;
}

/** Build the URL for a wallet-connect request. */
export function buildConnectUrl(port: number, requestId: string): string {
  return `http://127.0.0.1:${port}/connect/${requestId}`;
}
