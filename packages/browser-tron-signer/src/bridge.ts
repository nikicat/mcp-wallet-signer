/**
 * The transport this package used to own: a localhost HTTP server, a pending-request store and
 * a browser launcher. All three now live in the Rust `browser-web3-signer serve` process, which
 * {@link ServeProcess} spawns and supervises; this module is just the request half.
 */

import { ServeProcess, SignerErrorCode, WrongWalletAddressError } from "browser-web3-signer";
import type { Chain } from "browser-web3-signer";

/** How the caller wants the approval page opened. Mirrors the pre-0.3.1 `openBrowser` option. */
export type OpenBrowser = boolean | ((url: string) => void | Promise<void>);

/** The control API's response envelope. */
interface RequestResponse {
  success: boolean;
  result?: string;
  error?: string;
  code?: string;
}

/**
 * A `serve` subprocess plus the one request it knows how to make.
 *
 * `approvalUrl` is the bridge's own base URL, not the per-request approval page: the bridge
 * opens that page itself and never hands the URL back over the control API.
 */
export class Bridge {
  readonly #serve: ServeProcess;
  readonly #openBrowser?: (url: string) => void | Promise<void>;

  constructor(chain: Chain, openBrowser: OpenBrowser = true) {
    // A custom opener (or `false`) means "don't launch a browser for me" — `print` is how the
    // Rust side spells that. A custom opener still gets called, with the bridge URL.
    this.#serve = new ServeProcess(chain, openBrowser === true ? {} : { browser: "print" });
    if (typeof openBrowser === "function") this.#openBrowser = openBrowser;
  }

  /** Start the subprocess (idempotent) and return the port it bound. */
  async start(): Promise<number> {
    const baseUrl = await this.#serve.start();
    return Number(new URL(baseUrl).port);
  }

  /** The bound port, or null before {@link start}. */
  get port(): number | null {
    return this.#serve.baseUrl ? Number(new URL(this.#serve.baseUrl).port) : null;
  }

  /** Kill the subprocess and release the port. */
  async stop(): Promise<void> {
    await this.#serve.stop();
  }

  /** POST a request, block until the wallet answers, and unwrap the result. */
  async request(body: Record<string, unknown>): Promise<{ result: string; approvalUrl: string }> {
    const approvalUrl = await this.#serve.start();
    if (this.#openBrowser) await this.#openBrowser(approvalUrl);

    const res = await fetch(`${approvalUrl}/api/v1/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as RequestResponse;
    if (json.success && json.result !== undefined) return { result: json.result, approvalUrl };

    const message = json.error ?? `request failed (HTTP ${res.status})`;
    if (json.code === SignerErrorCode.WrongWalletAddress) throw new WrongWalletAddressError(message);
    throw new Error(message);
  }
}
