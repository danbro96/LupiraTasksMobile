import { authPort } from './authProvider';
import { ApiError, isNetworkError, REQUEST_TIMEOUT_MS } from '../../domain/apiError';
import { MAX_RETRIES, isRetriableRequest, isTransientStatus, retryDelayMs } from '../../domain/retryPolicy';

// Error primitives live in ./apiError (dependency-free, so pure consumers can import them
// without pulling in native modules). Re-exported here so existing `from '../api/mutator'`
// importers keep working.
export { ApiError, isNetworkError, REQUEST_TIMEOUT_MS };

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** One fetch attempt with its own abort timeout; transport failures become ApiError(0, …). */
async function fetchWithTimeout(fullUrl: string, init: RequestInit, headers: Headers): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(fullUrl, { ...init, headers, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      0,
      aborted
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Network unreachable: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Custom fetch invoked by every Orval-generated request.
 *
 * Returns the **envelope shape** `{ status, data, headers }` — Orval's `client: 'fetch'`
 * mode returns the mutator's value directly, so callers read `result.status` and
 * `result.data` (e.g. `getLists()` → `r.data.lists`).
 *
 * Owns:
 *  - base URL prefix (read live from `useAuth.getState().apiUrl` so the
 *    settings-screen override is always honoured)
 *  - bearer token injection
 *  - JSON content-type handling
 *  - bounded retry of transient failures (timeout/5xx/429) for idempotent requests
 *  - 204 No Content -> `{ data: undefined, status, headers }`
 *  - non-2xx -> throw `ApiError`
 */
type ApiEnvelope<T> = {
  status: number;
  data: T;
  headers: Headers;
};

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const auth = authPort();
  const apiUrl = auth.getApiUrl();
  const token = auth.getToken();
  if (!apiUrl) {
    throw new ApiError(0, 'API base URL is not configured.');
  }

  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // FormData sets its own multipart/form-data boundary — leave it alone.
  const isFormData =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;
  if (init?.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Idempotency-Key: set per-operation by the outbox replay layer (see replayOp in
  // src/offline/ops.ts), which passes it via `init.headers` so redelivered commands are
  // server-side no-ops. Nothing to do here — it flows through `init` untouched.

  const fullUrl = apiUrl.replace(/\/$/, '') + url;

  // Bounded retry on transient failures (timeout/unreachable, 5xx, 429) so a brief blip — e.g. a
  // Wi-Fi→cellular handoff — recovers transparently instead of surfacing/parking. Only retry
  // idempotent reads and writes carrying an Idempotency-Key (see retryPolicy). The outbox's
  // deferred retry remains the outer safety net once these immediate attempts are exhausted.
  const retriable = isRetriableRequest(init?.method, headers.has('Idempotency-Key'));

  // Reactive re-auth: if the server rejects our token (401) — e.g. it was revoked/rotated early
  // or our expiry clock was skewed, so the proactive refresh never fired — force a token refresh
  // and retry once. `triedReauth` flips once and is never reset, bounding this to a single forced
  // refresh + retry per call. We compare against the token actually sent (entryToken), not a live
  // store read, so a concurrent setSession can't make us think we got a new token when we didn't.
  const entryToken = token;
  let triedReauth = false;

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchWithTimeout(fullUrl, init ?? {}, headers);
    } catch (e) {
      // Transport failure (ApiError status 0). Retry if allowed, else give up.
      if (retriable && attempt < MAX_RETRIES) { await sleep(retryDelayMs(attempt, null)); continue; }
      throw e;
    }

    if (res.ok) break;

    if (retriable && isTransientStatus(res.status) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(attempt, res.headers.get('retry-after')));
      continue;
    }

    // Terminal non-2xx. Never throw a blank message: HTTP/2 has no reason phrase (statusText is
    // ''), and a dropped/empty body leaves text empty too — fall back to the status code so the
    // error isn't "ApiError: No error message" in Sentry / the UI.
    const text = await res.text().catch(() => '');

    // Reactive re-auth on a terminal 401 (retriable requests only — GET/HEAD or a write carrying
    // an Idempotency-Key, so the retry can't double-apply). refreshIfNeeded owns the clear/keep
    // decision: a *definitive* failure (refresh token rejected / none) clears the session and
    // returns null (→ sign-in screen); a *transient* failure keeps the session and returns the
    // same token, so we just surface the 401 and recover on the next sync trigger.
    if (res.status === 401 && retriable && !triedReauth) {
      triedReauth = true;
      const fresh = await auth.refresh(true, entryToken ?? undefined);
      if (fresh && fresh !== entryToken) {
        headers.set('Authorization', `Bearer ${fresh}`);
        attempt = -1; // next iteration is attempt 0 again — a fresh transient-retry budget
        continue;
      }
    }
    throw new ApiError(res.status, text || res.statusText || `HTTP ${res.status}`);
  }

  let body: unknown;
  if (res.status === 204) {
    body = undefined;
  } else {
    const contentType = res.headers.get('content-type') ?? '';
    body = contentType.includes('application/json')
      ? await res.json()
      : await res.text();
  }

  const envelope: ApiEnvelope<unknown> = {
    status: res.status,
    data: body,
    headers: res.headers,
  };
  return envelope as T;
}

export default apiFetch;
