import { create } from 'zustand';
import { enqueue } from './outbox';
import { stamp } from './ops';
import { toast } from '../components/Toast';

// Soft-delete with an Undo window. The item is hidden from lists immediately, but the durable
// `item.delete` op is only enqueued after the window lapses — so Undo cancels it with zero loss
// (no re-create, ids and history preserved). Lives outside the screens so the delete can be
// triggered from the task detail screen yet undone via a toast over the list screen.

const UNDO_MS = 5000;

interface PendingDeletesState {
  ids: Set<string>;
}

const useStore = create<PendingDeletesState>(() => ({ ids: new Set<string>() }));

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function setIds(mutate: (next: Set<string>) => void) {
  const next = new Set(useStore.getState().ids);
  mutate(next);
  useStore.setState({ ids: next });
}

function commit(listId: string, itemId: string) {
  timers.delete(itemId);
  void enqueue({ ...stamp(), kind: 'item.delete', listId, itemId })
    .catch(() => toast("Couldn't delete item"))
    .finally(() => setIds(s => s.delete(itemId)));
}

/**
 * Hide an item and schedule its deletion after a short Undo window. Shows an Undo toast;
 * tapping Undo cancels the delete entirely.
 */
export function requestItemDelete(listId: string, itemId: string, label = 'Item deleted'): void {
  setIds(s => s.add(itemId));
  timers.set(itemId, setTimeout(() => commit(listId, itemId), UNDO_MS));
  toast(label, {
    durationMs: UNDO_MS,
    action: {
      label: 'Undo',
      onPress: () => {
        const t = timers.get(itemId);
        if (t) clearTimeout(t);
        timers.delete(itemId);
        setIds(s => s.delete(itemId));
      },
    },
  });
}

/** Item ids currently inside their Undo window — hidden from list rendering. */
export function usePendingDeletes(): Set<string> {
  return useStore(s => s.ids);
}
