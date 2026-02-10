// API client for communicating with the MCP server

export interface PendingRequest {
  id: string;
  type: "connect" | "send_transaction" | "sign_message" | "sign_typed_data";
  chainId?: number;
  createdAt: number;
  // send_transaction fields
  to?: string;
  value?: string;
  data?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  // sign_message fields
  message?: string;
  address?: string;
  // sign_typed_data fields
  domain?: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  types?: Record<string, Array<{ name: string; type: string }>>;
  primaryType?: string;
}

export interface PendingApiResponse {
  request: PendingRequest;
}

export interface CompleteRequest {
  success: boolean;
  result?: string;
  error?: string;
}

/**
 * Fetch pending request details from the server
 */
export async function fetchPendingRequest(id: string): Promise<PendingRequest> {
  const response = await fetch(`/api/pending/${id}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data: PendingApiResponse = await response.json();
  return data.request;
}

/**
 * Complete a pending request with a result
 */
export async function completeRequest(
  id: string,
  result: CompleteRequest
): Promise<void> {
  const response = await fetch(`/api/complete/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}

/**
 * Complete a request with success
 */
export async function completeSuccess(id: string, result: string): Promise<void> {
  await completeRequest(id, { success: true, result });
}

/**
 * Complete a request with error
 */
export async function completeError(id: string, error: string): Promise<void> {
  await completeRequest(id, { success: false, error });
}
