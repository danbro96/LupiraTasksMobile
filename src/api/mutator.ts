import { useAuth } from '../store/auth-store';

/**
 * Single-axis error class thrown for every non-2xx response. Consumers
 * downstream check `err.status` to branch on specific HTTP codes (e.g. a 409
 * conflict handler), so the contract stays stable as the generated client
 * grows.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/**
 * Custom fetch invoked by every Orval-generated request.
 *
 * Returns the **envelope shape** Orval's `client: 'react-query'` mode expects
 * from its mutator: `{ status, data, headers }`. Consumers access
 * `result.data?.data` (one `.data` from react-query, one from this envelope).
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

  // Idempotency-Key placeholder: mutating offline-replayable requests will
  // stamp a stable per-operation key here so the backend can dedupe retries
  // once the offline outbox lands (WF-1b). Left unset for now.
  // if (init?.method && isReplayable(init.method) && !headers.has('Idempotency-Key')) {
  //   headers.set('Idempotency-Key', <stable-operation-id>);
  // }

  const fullUrl = apiUrl.replace(/\/$/, '') + url;
  const res = await fetch(fullUrl, { ...init, headers });

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
