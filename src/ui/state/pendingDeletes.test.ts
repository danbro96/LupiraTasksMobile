import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// pendingDeletes pulls in outbox (→ expo-sqlite) and react-native (AppState); the toast leaf is
// zustand-only but mocked here so we can assert the Undo handler without standing up the store.
const { appStateListeners, stampCount } = vi.hoisted(() => ({
  appStateListeners: [] as ((s: string) => void)[],
  stampCount: { n: 0 },
}));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, cb: (s: string) => void) => {
      appStateListeners.push(cb);
      return { remove: () => {} };
    },
  },
}));
vi.mock('../../sync/outbox', () => ({ enqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../domain/ops', () => ({
  stamp: vi.fn(() => ({ commandId: `cmd-${++stampCount.n}`, occurredAt: '2026-06-07T00:00:00.000Z' })),
}));
vi.mock('../../feedback/toast', () => ({ toast: vi.fn() }));

import { enqueue } from '../../sync/outbox';
import { stamp } from '../../domain/ops';
import { toast } from '../../feedback/toast';
import { requestItemDelete } from './pendingDeletes';

const enqueueMock = enqueue as unknown as ReturnType<typeof vi.fn>;
const stampMock = stamp as unknown as ReturnType<typeof vi.fn>;
const toastMock = toast as unknown as ReturnType<typeof vi.fn>;

/** The Undo handler attached to the most recent toast. */
function latestUndo(): () => void {
  const opts = toastMock.mock.calls.at(-1)![1];
  return opts.action.onPress as () => void;
}

describe('requestItemDelete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('hides immediately and only enqueues the delete after the undo window', () => {
    requestItemDelete('L', 'A');
    expect(enqueueMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'item.delete', listId: 'L', itemId: 'A' }));
  });

  it('Undo cancels the delete entirely', () => {
    requestItemDelete('L', 'B');
    latestUndo()();
    vi.advanceTimersByTime(6000);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a second delete of the same item does not double-enqueue', () => {
    requestItemDelete('L', 'C');
    requestItemDelete('L', 'C'); // re-entrant: must drop the first timer
    vi.advanceTimersByTime(6000);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('Undo still works after a re-entrant delete (no orphaned timer fires)', () => {
    requestItemDelete('L', 'D');
    requestItemDelete('L', 'D');
    latestUndo()();
    vi.advanceTimersByTime(6000);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('stamps the delete at request time, not commit time', () => {
    requestItemDelete('L', 'E');
    expect(stampMock).toHaveBeenCalledTimes(1); // stamped when the user acted
    vi.advanceTimersByTime(6000);
    expect(stampMock).toHaveBeenCalledTimes(1); // commit enqueues the held op, no re-stamp
  });

  it('backgrounding commits pending deletes immediately (no memory-only loss window)', () => {
    requestItemDelete('L', 'F');
    expect(enqueueMock).not.toHaveBeenCalled();
    for (const cb of appStateListeners) cb('background');
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    expect(enqueueMock).toHaveBeenCalledTimes(1); // the timer was cleared — no double commit
  });
});
