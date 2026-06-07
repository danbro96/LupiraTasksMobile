// Pure decisions for the mutator's transient-failure retry loop. Kept dependency-free so the
// policy is unit-testable without the fetch/auth machinery. The loop itself (sleep + fetch)
// lives in mutator.ts.

/** Max automatic retries after the first attempt (so up to MAX_RETRIES + 1 total attempts). */
export const MAX_RETRIES = 2;

const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 10_000;

/**
 * Transient = worth retrying: a transport failure (status 0 = timeout/unreachable), a 429
 * rate-limit, or any 5xx. A 4xx (other than 429) is a deterministic client/semantic error and
 * must NOT be retried.
 */
export function isTransientStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * Whether a request is safe to auto-retry. Idempotent reads (GET/HEAD) always are; a write is
 * only safe when it carries an Idempotency-Key (the server dedupes a redelivered command, so a
 * retry can't double-apply). Writes without one fall back to the outbox's deferred retry.
 */
export function isRetriableRequest(method: string | undefined, hasIdempotencyKey: boolean): boolean {
  const m = (method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  return hasIdempotencyKey;
}

/**
 * Delay before the next attempt. Honors a numeric `Retry-After` (seconds) when present;
 * otherwise exponential backoff (300ms, 600ms, …) plus jitter, capped at MAX_DELAY_MS.
 * `attempt` is 0-based (0 = the first retry). `rand` is injectable for deterministic tests.
 */
export function retryDelayMs(attempt: number, retryAfter: string | null, rand: () => number = Math.random): number {
  const secs = retryAfter !== null ? Number(retryAfter) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_DELAY_MS);
  const base = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(rand() * BASE_DELAY_MS);
  return Math.min(base + jitter, MAX_DELAY_MS);
}
