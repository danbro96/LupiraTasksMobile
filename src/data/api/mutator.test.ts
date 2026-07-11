import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAuthPort } from './authProvider';

// apiFetch reads the live session through the AuthPort (registered by the auth store in the app).
// Here we register a stub so each test can drive the token + the forced-refresh result without
// pulling in the store (→ expo-secure-store / Sentry, which don't load in the node test env).
const authState = {
  apiUrl: 'https://api.test',
  token: 'tok-1' as string | null,
  refresh: vi.fn(),
};
setAuthPort({
  getApiUrl: () => authState.apiUrl,
  getToken: () => authState.token,
  getActor: () => null,
  getSelf: () => null,
  refresh: force => authState.refresh(force),
  applyProfile: async () => {},
  onSignIn: () => () => {},
});

// Keep the real retry predicates but zero the backoff so the 5xx regression test is instant.
vi.mock('../../domain/retryPolicy', async importOriginal => {
  const actual = await importOriginal<typeof import('../../domain/retryPolicy')>();
  return { ...actual, retryDelayMs: () => 0 };
});

import { apiFetch } from './mutator';
import { ApiError } from '../../domain/apiError';

const json200 = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
const resp = (status: number, body = '') => new Response(body, { status });

let fetchMock: ReturnType<typeof vi.fn>;
let sentAuth: (string | null)[]; // the Authorization header captured at each fetch call

/** Serve the given responses in order, recording the auth header sent on each request. */
function queueResponses(responses: Response[]) {
  fetchMock.mockImplementation((_url: string, init: RequestInit) => {
    sentAuth.push((init.headers as Headers).get('Authorization'));
    return Promise.resolve(responses.shift()!);
  });
}

beforeEach(() => {
  authState.token = 'tok-1';
  authState.refresh = vi.fn();
  sentAuth = [];
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('apiFetch reactive 401', () => {
  it('force-refreshes and retries once with the new token, then succeeds', async () => {
    authState.refresh = vi.fn().mockResolvedValue('tok-2');
    queueResponses([resp(401, 'expired'), json200({ ok: true })]);

    const r = await apiFetch<{ status: number; data: { ok: boolean } }>('/lists');

    expect(r.status).toBe(200);
    expect(r.data).toEqual({ ok: true });
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(authState.refresh).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentAuth).toEqual(['Bearer tok-1', 'Bearer tok-2']); // retry carries the fresh token
  });

  it('throws without retrying when the forced refresh returns the same (transient) token', async () => {
    authState.refresh = vi.fn().mockResolvedValue('tok-1'); // unchanged → transient blip, keep session
    queueResponses([resp(401, 'nope')]);

    await expect(apiFetch('/lists')).rejects.toMatchObject({ status: 401 });
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the forced refresh cleared the session (returns null)', async () => {
    authState.refresh = vi.fn().mockResolvedValue(null); // definitive → refreshIfNeeded already cleared
    queueResponses([resp(401, 'nope')]);

    await expect(apiFetch('/lists')).rejects.toMatchObject({ status: 401 });
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-auths at most once: a second 401 after a successful refresh throws', async () => {
    authState.refresh = vi.fn().mockResolvedValue('tok-2');
    queueResponses([resp(401, 'a'), resp(401, 'b')]);

    await expect(apiFetch('/lists')).rejects.toMatchObject({ status: 401 });
    expect(authState.refresh).toHaveBeenCalledTimes(1); // not re-attempted
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-auths a write that carries an Idempotency-Key (safe to retry)', async () => {
    authState.refresh = vi.fn().mockResolvedValue('tok-2');
    queueResponses([resp(401), json200({ id: 'x' })]);

    const r = await apiFetch<{ status: number }>('/lists', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'cmd-1' },
      body: JSON.stringify({ name: 'n' }),
    });

    expect(r.status).toBe(200);
    expect(authState.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-auth a write without an Idempotency-Key (not safe to retry)', async () => {
    authState.refresh = vi.fn().mockResolvedValue('tok-2');
    queueResponses([resp(401)]);

    await expect(apiFetch('/lists', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 });
    expect(authState.refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat a 403 as an auth failure', async () => {
    authState.refresh = vi.fn();
    queueResponses([resp(403, 'forbidden')]);

    await expect(apiFetch('/lists')).rejects.toMatchObject({ status: 403 });
    expect(authState.refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still retries a transient 5xx via the existing loop (no re-auth)', async () => {
    authState.refresh = vi.fn();
    queueResponses([resp(500, 'boom'), json200({ ok: true })]);

    const r = await apiFetch<{ status: number }>('/lists');

    expect(r.status).toBe(200);
    expect(authState.refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
