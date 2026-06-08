import { create } from 'zustand';
import { enqueue } from './outbox';
import { stamp } from './ops';
import { toast } from '../components/Toast';

// Soft-delete with an Undo window. The item(s) are hidden from lists immediately, but the durable
// `item.delete` op(s) are only enqueued after the window lapses — so Undo cancels with zero loss
// (no re-create, ids and history preserved). Lives outside the screens so a delete can be
// triggered from the task detail screen yet undone via a toast over the list screen.

const UNDO_MS = 6000;

interface PendingDeletesState {
  ids: Set<string>;
}

const useStore = create<PendingDeletesState>(() => ({ ids: new Set<string>() }));

// One timer per pending id (a subtree delete shares a single timer across its ids).
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function setIds(mutate: (next: Set<string>) => void) {
  const next = new Set(useStore.getState().ids);
  mutate(next);
  useStore.setState({ ids: next });
}

function commit(listId: string, ids: string[]) {
  for (const id of ids) timers.delete(id);
  void Promise.allSettled(ids.map(itemId => enqueue({ ...stamp(), kind: 'item.delete', listId, itemId })))
    .then(rs => {
      if (rs.some(r => r.status === 'rejected')) toast("Couldn't delete item");
    })
    .finally(() => setIds(s => ids.forEach(id => s.delete(id))));
}

/**
 * Hide one or more items and schedule their deletion after a short Undo window (a parent and its
 * descendants delete together as one undoable group). Shows an Undo toast; tapping Undo cancels.
 */
export function requestItemDeleteMany(listId: string, ids: string[], label?: string): void {
  if (ids.length === 0) return;
  // Re-entrant on any of these ids: drop the prior timer so it can't fire after an Undo.
  for (const id of ids) {
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
  }
  setIds(s => ids.forEach(id => s.add(id)));
  const timer = setTimeout(() => commit(listId, ids), UNDO_MS);
  for (const id of ids) timers.set(id, timer);
  toast(label ?? (ids.length > 1 ? `${ids.length} items deleted` : 'Item deleted'), {
    durationMs: UNDO_MS,
    action: {
      label: 'Undo',
      onPress: () => {
        clearTimeout(timer);
        for (const id of ids) timers.delete(id);
        setIds(s => ids.forEach(id => s.delete(id)));
      },
    },
  });
}

/** Hide a single item and schedule its deletion after the Undo window. */
export function requestItemDelete(listId: string, itemId: string, label = 'Item deleted'): void {
  requestItemDeleteMany(listId, [itemId], label);
}

/** Item ids currently inside their Undo window — hidden from list rendering. */
export function usePendingDeletes(): Set<string> {
  return useStore(s => s.ids);
}
