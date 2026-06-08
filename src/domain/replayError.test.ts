import { describe, it, expect } from 'vitest';
import { ApiError } from './apiError';
import { classifyReplayError } from './replayError';

describe('classifyReplayError', () => {
  it('401 pauses: stop, leave the row, surface nothing', () => {
    const d = classifyReplayError(new ApiError(401, 'expired'), 'item.rename');
    expect(d).toEqual({
      outcome: 'pause', stop: true, rowStatus: null, rowError: null,
      lastError: null, serverUnreachable: false, logTag: 'replay:401',
    });
  });

  it.each([400, 404, 409, 422])('parks 4xx (%i): mark parked, surface, continue', status => {
    const d = classifyReplayError(new ApiError(status, 'nope'), 'item.complete');
    expect(d.outcome).toBe('park');
    expect(d.stop).toBe(false);
    expect(d.rowStatus).toBe('parked');
    expect(d.rowError).toBe(`${status} nope`);
    expect(d.lastError).toBe(`item.complete: ${status} nope`);
    expect(d.serverUnreachable).toBe(false);
    expect(d.logTag).toBe('replay:parked');
  });

  it('truncates a long 4xx message in lastError (120 chars) but not rowError', () => {
    const msg = 'x'.repeat(300);
    const d = classifyReplayError(new ApiError(409, msg), 'list.rename');
    expect(d.lastError).toBe(`list.rename: 409 ${'x'.repeat(120)}`);
    expect(d.rowError).toBe(`409 ${msg}`); // row keeps the full message
  });

  it('network failure (status 0) → retry, stop, server unreachable', () => {
    const e = new ApiError(0, 'Request timed out after 10s');
    const d = classifyReplayError(e, 'item.create');
    expect(d.outcome).toBe('retry');
    expect(d.stop).toBe(true);
    expect(d.rowStatus).toBe('pending');
    expect(d.serverUnreachable).toBe(true);
    expect(d.lastError).toBe('Request timed out after 10s');
    expect(d.rowError).toBe(String(e)); // "ApiError: Request timed out after 10s"
    expect(d.logTag).toBe('replay:retry');
  });

  it.each([500, 502, 503])('5xx (%i) → retry, stop, but server NOT marked unreachable', status => {
    const d = classifyReplayError(new ApiError(status, 'boom'), 'item.move');
    expect(d.outcome).toBe('retry');
    expect(d.stop).toBe(true);
    expect(d.rowStatus).toBe('pending');
    expect(d.serverUnreachable).toBe(false);
    expect(d.lastError).toBe('boom');
    expect(d.logTag).toBe('replay:retry');
  });

  it('non-HTTP error (client bug) → park and continue', () => {
    const e = new TypeError("Cannot read property 'x' of undefined");
    const d = classifyReplayError(e, 'item.assign');
    expect(d.outcome).toBe('park');
    expect(d.stop).toBe(false);
    expect(d.rowStatus).toBe('parked');
    expect(d.rowError).toBe(String(e));
    expect(d.lastError).toBe(String(e));
    expect(d.serverUnreachable).toBe(false);
    expect(d.logTag).toBe('replay:bug');
  });

  it('a thrown non-Error value still parks (never wedges the queue)', () => {
    const d = classifyReplayError('weird string throw', 'item.delete');
    expect(d.outcome).toBe('park');
    expect(d.stop).toBe(false);
    expect(d.rowStatus).toBe('parked');
    expect(d.logTag).toBe('replay:bug');
  });
});
