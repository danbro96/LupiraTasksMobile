import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// pendingDeletes pulls in outbox (→ expo-sqlite) and Toast (→ react-native), neither of which
// load in the node test env — mock them so we can unit-test the timer/undo scheduling in isolation.
vi.mock('./outbox', () => ({ enqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./ops', () => ({ stamp: () => ({ commandId: 'cmd', occurredAt: '2026-06-07T00:00:00.000Z' }) }));
vi.mock('../components/Toast', () => ({ toast: vi.fn() }));

import { enqueue } from './outbox';
import { toast } from '../components/Toast';
import { requestItemDelete } from './pendingDeletes';

const enqueueMock = enqueue as unknown as ReturnType<typeof vi.fn>;
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
});
