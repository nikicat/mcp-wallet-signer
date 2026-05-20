/**
 * Base shape every pending request must satisfy. Chain-specific packages extend this with their
 * own discriminated union (see `EvmPendingRequest`, `TronPendingRequest`).
 */
export interface BaseRequest {
  id: string;
  type: string;
  createdAt: number;
}

/** Success branch of {@linkcode RequestResult}. */
export interface SuccessResult {
  success: true;
  /** Address, tx hash, or signature — interpreted per request type by the caller. */
  result: string;
}

/** Failure branch of {@linkcode RequestResult}. */
export interface ErrorResult {
  success: false;
  error: string;
  /** Discriminating code so consumers can react programmatically. See `SignerErrorCode`. */
  code?: string;
}

export type RequestResult = SuccessResult | ErrorResult;

/** Internal store entry. */
export interface PendingEntry<R extends BaseRequest = BaseRequest> {
  request: R;
  resolve: (result: RequestResult) => void;
  reject: (error: Error) => void;
}

/** HTTP API shape: `GET /api/pending/:id`. */
export interface PendingApiResponse<R extends BaseRequest = BaseRequest> {
  request: R;
}

/** HTTP API shape: `POST /api/complete/:id`. */
export interface CompleteApiRequest {
  success: boolean;
  result?: string;
  error?: string;
  /** Discriminating code paired with `error`. See `SignerErrorCode`. */
  code?: string;
}
