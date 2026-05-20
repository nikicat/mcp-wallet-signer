import type { BaseRequest, PendingEntry, RequestResult } from "./types.ts";

/** Default timeout for pending requests (5 minutes). */
export const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/** Generate a UUIDv4 for a fresh request id. */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Chain-agnostic store of pending signing requests, keyed by UUID.
 *
 * Each call to {@linkcode create} adds an entry whose Promise resolves when {@linkcode complete}
 * is called (typically from the browser approval UI via the HTTP bridge) or rejects on timeout
 * / {@linkcode cancel}.
 *
 * Chain-specific subclasses extend this with typed factory helpers (`createConnectRequest`,
 * `createSendTransactionRequest`, …) — see `browser-evm-signer` / `browser-tron-signer`.
 */
export class PendingStore<R extends BaseRequest = BaseRequest> {
  private pending: Map<string, PendingEntry<R>> = new Map();
  private timeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Register a pre-built request. Returns its id (already on the request) and a Promise that
   * resolves on completion. Subclasses typically wrap this in a typed factory helper.
   */
  create(request: R): { id: string; promise: Promise<RequestResult> } {
    const promise = new Promise<RequestResult>((resolve, reject) => {
      const entry: PendingEntry<R> = { request, resolve, reject };
      this.pending.set(request.id, entry);

      const timeoutId = setTimeout(() => {
        if (this.pending.has(request.id)) {
          this.pending.delete(request.id);
          this.timeouts.delete(request.id);
          reject(new Error("Request timed out after 5 minutes"));
        }
      }, REQUEST_TIMEOUT_MS);

      this.timeouts.set(request.id, timeoutId);
    });

    return { id: request.id, promise };
  }

  /** Get the request object for a pending id, or undefined if it's already completed/cancelled. */
  get(id: string): R | undefined {
    return this.pending.get(id)?.request;
  }

  /** Resolve a pending request with a result. Returns false if the id was unknown. */
  complete(id: string, result: RequestResult): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    const timeoutId = this.timeouts.get(id);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    entry.resolve(result);
    this.pending.delete(id);
    return true;
  }

  /** Reject a pending request with `reason`. Returns false if the id was unknown. */
  cancel(id: string, reason?: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    const timeoutId = this.timeouts.get(id);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    entry.reject(new Error(reason || "Request cancelled"));
    this.pending.delete(id);
    return true;
  }

  /** True if a request with this id is still pending. */
  has(id: string): boolean {
    return this.pending.has(id);
  }

  /** Snapshot of all pending request ids. */
  getPendingIds(): string[] {
    return Array.from(this.pending.keys());
  }

  /** Number of pending requests. */
  get size(): number {
    return this.pending.size;
  }
}
