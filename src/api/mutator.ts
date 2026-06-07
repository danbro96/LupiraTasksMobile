import { useAuth } from '../store/auth-store';
import { ApiError, isNetworkError, REQUEST_TIMEOUT_MS } from './apiError';

// Error primitives live in ./apiError (dependency-free, so pure consumers can import them
// without pulling in native modules). Re-exported here so existing `from '../api/mutator'`
// importers keep working.
export { ApiError, isNetworkError, REQUEST_TIMEOUT_MS };

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
  const { apiUrl, token } = useAuth.getState();
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

  // Fail fast: a dead/slow host would otherwise hang the request (and the whole sync) forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(fullUrl, { ...init, headers, signal: controller.signal });
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

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
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
