import type {
  ConnectRequest,
  PendingEntry,
  PendingRequest,
  RequestResult,
  SendTransactionRequest,
  SignMessageRequest,
  SignTypedDataRequest,
} from "./types.ts";

// Generates a unique request ID
function generateId(): string {
  return crypto.randomUUID();
}

// Timeout for pending requests (5 minutes)
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Store for pending signing requests.
 * Each request creates a Promise that resolves when the browser completes the signing.
 */
class PendingStore {
  private pending: Map<string, PendingEntry> = new Map();
  private timeouts: Map<string, number> = new Map();

  /**
   * Create a new connect wallet request
   */
  createConnectRequest(chainId?: number): { id: string; promise: Promise<RequestResult> } {
    const request: ConnectRequest = {
      id: generateId(),
      type: "connect",
      chainId,
      createdAt: Date.now(),
    };
    return this.create(request);
  }

  /**
   * Create a new send transaction request
   */
  createSendTransactionRequest(params: {
    to: string;
    value?: string;
    data?: string;
    chainId?: number;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  }): { id: string; promise: Promise<RequestResult> } {
    const request: SendTransactionRequest = {
      id: generateId(),
      type: "send_transaction",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }

  /**
   * Create a new sign message request
   */
  createSignMessageRequest(params: {
    message: string;
    address?: string;
    chainId?: number;
  }): { id: string; promise: Promise<RequestResult> } {
    const request: SignMessageRequest = {
      id: generateId(),
      type: "sign_message",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }

  /**
   * Create a new sign typed data request
   */
  createSignTypedDataRequest(params: {
    domain: SignTypedDataRequest["domain"];
    types: SignTypedDataRequest["types"];
    primaryType: string;
    message: Record<string, unknown>;
    address?: string;
    chainId?: number;
  }): { id: string; promise: Promise<RequestResult> } {
    const request: SignTypedDataRequest = {
      id: generateId(),
      type: "sign_typed_data",
      createdAt: Date.now(),
      ...params,
    };
    return this.create(request);
  }

  /**
   * Create a pending request and return a Promise that resolves when completed
   */
  private create<T extends PendingRequest>(request: T): { id: string; promise: Promise<RequestResult> } {
    const promise = new Promise<RequestResult>((resolve, reject) => {
      const entry: PendingEntry<T> = {
        request,
        resolve,
        reject,
      };
      this.pending.set(request.id, entry);

      // Set timeout to auto-reject
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

  /**
   * Get a pending request by ID
   */
  get(id: string): PendingRequest | undefined {
    return this.pending.get(id)?.request;
  }

  /**
   * Complete a pending request with a result
   */
  complete(id: string, result: RequestResult): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }

    // Clear timeout
    const timeoutId = this.timeouts.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    // Resolve the promise
    entry.resolve(result);
    this.pending.delete(id);
    return true;
  }

  /**
   * Cancel a pending request
   */
  cancel(id: string, reason?: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }

    // Clear timeout
    const timeoutId = this.timeouts.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    // Reject the promise
    entry.reject(new Error(reason || "Request cancelled"));
    this.pending.delete(id);
    return true;
  }

  /**
   * Check if a request is pending
   */
  has(id: string): boolean {
    return this.pending.has(id);
  }

  /**
   * Get all pending request IDs
   */
  getPendingIds(): string[] {
    return Array.from(this.pending.keys());
  }

  /**
   * Get count of pending requests
   */
  get size(): number {
    return this.pending.size;
  }
}

// Singleton instance
export const pendingStore = new PendingStore();
