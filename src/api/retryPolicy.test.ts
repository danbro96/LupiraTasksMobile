import { describe, it, expect } from 'vitest';
import { MAX_RETRIES, isTransientStatus, isRetriableRequest, retryDelayMs } from './retryPolicy';

describe('isTransientStatus', () => {
  it('treats network (0), 429, and 5xx as transient', () => {
    expect(isTransientStatus(0)).toBe(true);
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(500)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
  });

  it('treats other 4xx and 2xx/3xx as terminal', () => {
    for (const s of [400, 401, 404, 409, 422, 200, 204, 301]) {
      expect(isTransientStatus(s)).toBe(false);
    }
  });
});

describe('isRetriableRequest', () => {
  it('always retries idempotent reads', () => {
    expect(isRetriableRequest('GET', false)).toBe(true);
    expect(isRetriableRequest('HEAD', false)).toBe(true);
    expect(isRetriableRequest(undefined, false)).toBe(true); // fetch defaults to GET
    expect(isRetriableRequest('get', false)).toBe(true); // case-insensitive
  });

  it('retries writes only when they carry an Idempotency-Key', () => {
    expect(isRetriableRequest('POST', true)).toBe(true);
    expect(isRetriableRequest('PATCH', true)).toBe(true);
    expect(isRetriableRequest('DELETE', true)).toBe(true);
    expect(isRetriableRequest('POST', false)).toBe(false);
    expect(isRetriableRequest('PATCH', false)).toBe(false);
    expect(isRetriableRequest('DELETE', false)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  const noJitter = () => 0;

  it('honors a numeric Retry-After (seconds → ms), capped', () => {
    expect(retryDelayMs(0, '2', noJitter)).toBe(2000);
    expect(retryDelayMs(0, '0', noJitter)).toBe(0);
    expect(retryDelayMs(0, '999', noJitter)).toBe(10_000); // capped at MAX_DELAY_MS
  });

  it('falls back to exponential backoff when Retry-After is absent or non-numeric', () => {
    expect(retryDelayMs(0, null, noJitter)).toBe(300);
    expect(retryDelayMs(1, null, noJitter)).toBe(600);
    expect(retryDelayMs(0, 'Wed, 21 Oct 2099 07:28:00 GMT', noJitter)).toBe(300); // HTTP-date → NaN → backoff
  });

  it('adds bounded jitter on top of the base delay', () => {
    expect(retryDelayMs(0, null, () => 0.5)).toBe(300 + 150);
    expect(retryDelayMs(1, null, () => 0.999)).toBe(600 + 299);
  });

  it('exposes a small, bounded retry budget', () => {
    expect(MAX_RETRIES).toBe(2);
  });
});
