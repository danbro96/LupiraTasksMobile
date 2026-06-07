import { ApiError } from '../api/apiError';

// Pure decision table for "an outbox op's replay threw — now what?". Extracted from
// runDrain (outbox.ts) so the branch matrix is named, documented, and unit-testable without
// SQLite/the API. runDrain just applies the returned decision.
//
//   401            → pause:  stop draining, leave the row pending, surface nothing (re-auth first)
//   4xx (≠401)     → park:   mark parked, surface the conflict, continue to the next op
//   0 (network)    → retry:  keep pending, stop, mark server unreachable, retry next trigger
//   5xx (transient)→ retry:  keep pending, stop, retry next trigger
//   non-HTTP error → park:   a client bug fails identically every time, so park (don't wedge)

export interface ReplayDecision {
  /** Semantic outcome (drives the debug log + reasoning). */
  outcome: 'pause' | 'park' | 'retry';
  /** Stop the drain loop after this op (break) vs move on to the next (continue). */
  stop: boolean;
  /** Persist the row at this status; null = leave the row untouched (pause). */
  rowStatus: 'parked' | 'pending' | null;
  /** Error string to persist on the outbox row; null when not persisting. */
  rowError: string | null;
  /** Short message to surface via setLastError; null = leave the banner message as-is. */
  lastError: string | null;
  /** Mark the server unreachable (transport failure, status 0). */
  serverUnreachable: boolean;
  /** Debug log tag, mirroring the original inline logs. */
  logTag: 'replay:401' | 'replay:parked' | 'replay:retry' | 'replay:bug';
}

export function classifyReplayError(e: unknown, opKind: string): ReplayDecision {
  if (e instanceof ApiError) {
    if (e.status === 401) {
      // Token expired — keep the row pending and stop until a refresh re-authenticates.
      return { outcome: 'pause', stop: true, rowStatus: null, rowError: null, lastError: null, serverUnreachable: false, logTag: 'replay:401' };
    }
    if (e.status >= 400 && e.status < 500) {
      // Semantic conflict (400/404/409, …): unrecoverable on retry — park so it can't wedge the queue.
      return {
        outcome: 'park',
        stop: false,
        rowStatus: 'parked',
        rowError: `${e.status} ${e.message}`,
        lastError: `${opKind}: ${e.status} ${String(e.message).slice(0, 120)}`,
        serverUnreachable: false,
        logTag: 'replay:parked',
      };
    }
    // status 0 (timeout/unreachable) or 5xx — transient: keep pending, stop, retry next trigger.
    return {
      outcome: 'retry',
      stop: true,
      rowStatus: 'pending',
      rowError: String(e),
      lastError: e.message,
      serverUnreachable: e.status === 0,
      logTag: 'replay:retry',
    };
  }
  // Non-HTTP error = client bug; it fails identically every retry, so park (and log the stack upstream).
  return { outcome: 'park', stop: false, rowStatus: 'parked', rowError: String(e), lastError: String(e), serverUnreachable: false, logTag: 'replay:bug' };
}
