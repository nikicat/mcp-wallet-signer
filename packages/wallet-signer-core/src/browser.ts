/**
 * Open a URL in the user's browser. If the `BROWSER` env var is set, that browser
 * is used (handy when the target wallet extension lives in a non-default browser);
 * otherwise the OS default is used. Failures are logged, not thrown — the user may
 * choose to open the URL manually.
 *
 * `BROWSER` may be a binary name (`firefox`, `google-chrome`, `brave-browser`) or an
 * absolute path. Honoured on macOS, Windows, and Linux via `open`'s `app.name`.
 */
export async function openBrowser(url: string): Promise<void> {
  try {
    // Dynamic imports: avoid pulling in `open` (and its `is-wsl` dep) at module load time
    // when a consumer provides a custom openBrowser and never needs this default.
    const { default: open } = await import("open");
    const { default: process } = await import("node:process");
    const browser = process.env.BROWSER;
    if (browser && browser.length > 0) {
      await open(url, { app: { name: browser } });
    } else {
      await open(url);
    }
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
