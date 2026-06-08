// Transport/error primitives shared by the API mutator and the offline replay layer.
// Kept dependency-free (no auth-store / native imports) so pure consumers — e.g. the
// replay-error classifier — can import it under the node unit-test harness.

/**
 * Single-axis error class thrown for every non-2xx response. Consumers downstream check
 * `err.status` to branch on specific HTTP codes (e.g. a 409 conflict handler), so the
 * contract stays stable as the generated client grows. Status 0 = no HTTP response
 * (timeout / unreachable host).
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** True for transport-level failures (timeout / unreachable host) — status 0, no HTTP response. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}

/** Requests abort after this long so a dead/slow server fails fast instead of hanging forever. */
export const REQUEST_TIMEOUT_MS = 10_000;
