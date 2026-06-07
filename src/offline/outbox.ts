import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useAuth } from '../store/auth-store';
import { ApiError } from '../api/mutator';
import { applyItemEvent } from './itemLww';
import { emptyItemState } from './itemState';
import {
  getDb, getItemState, putItemState, putListDoc, insertOutbox,
  pendingOutbox, pendingCount, deleteOutbox, bumpOutboxFailure,
} from './db';
import { type ClientOp, opToEvents } from './ops';

// Sync status surfaced to the UI (offline banner + pending badge).
interface SyncStatus {
  online: boolean;
  pending: number;
  mirrorRevision: number;
  setOnline: (online: boolean) => void;
  setPending: (pending: number) => void;
  bump: () => void;
}
export const useSyncStatus = create<SyncStatus>(set => ({
  online: true,
  pending: 0,
  mirrorRevision: 0,
  setOnline: online => set({ online }),
  setPending: pending => set({ pending }),
  bump: () => set(s => ({ mirrorRevision: s.mirrorRevision + 1 })),
}));

/** Notify mirror subscribers (screens) that local data changed, so they reload. */
export function bumpMirror(): void {
  useSyncStatus.getState().bump();
}

async function refreshPending(): Promise<void> {
  const db = await getDb();
  useSyncStatus.getState().setPending(await pendingCount(db));
}

function actor(): string | null {
  return useAuth.getState().user?.sub ?? null;
}

/** A best-effort optimistic ListResponse so a list created offline shows immediately. */
function optimisticListDoc(op: Extract<ClientOp, { kind: 'list.create' }>, owner: string | null) {
  return {
    id: op.listId,
    version: 0,
    name: op.name,
    kind: op.listKind,
    color: op.color,
    ownerEmail: owner ?? '',
    isArchived: false,
    createdAt: op.occurredAt,
    updatedAt: op.occurredAt,
    tags: [],
    members: owner ? [{ email: owner, role: 'Owner', addedAt: op.occurredAt, addedBy: owner }] : [],
  };
}

/**
 * Enqueue a user action: optimistically apply it to the local mirror AND append the
 * durable outbox row in one SQLite transaction, then kick the replay worker. The UI
 * updates immediately and the change survives an app restart while offline.
 */
export async function enqueue(op: ClientOp): Promise<void> {
  const db = await getDb();
  const who = actor();

  await db.withTransactionAsync(async () => {
    for (const ev of opToEvents(op)) {
      const prev = (await getItemState(db, ev.itemId)) ?? emptyItemState();
      await putItemState(db, applyItemEvent(prev, ev, who));
    }
    if (op.kind === 'list.create') {
      await putListDoc(db, { id: op.listId, archived: false, deleted: false, updatedAt: op.occurredAt, doc: optimisticListDoc(op, who) });
    }
    await insertOutbox(db, op.commandId, JSON.stringify(op), op.occurredAt);
  });

  await refreshPending();
  bumpMirror();
  void drainOutbox();
}

// Serialized replay: one in-flight request, strict seq order, so causal chains stay ordered.
let draining: Promise<void> | null = null;

export function drainOutbox(): Promise<void> {
  if (!draining) draining = runDrain().finally(() => { draining = null; });
  return draining;
}

async function runDrain(): Promise<void> {
  const db = await getDb();
  try {
    await useAuth.getState().refreshIfNeeded(); // ensure replay uses a live access token
    for (;;) {
      const pending = await pendingOutbox(db);
      if (pending.length === 0) break;

      const row = pending[0];
      const op = JSON.parse(row.op_json) as ClientOp;

      try {
        const { replayOp } = await import('./ops');
        await replayOp(op);
        await deleteOutbox(db, row.seq);
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) break; // token expired — keep pending, stop until re-auth
          if (e.status >= 400 && e.status < 500) {
            // semantic conflict (404/409/400): park so it doesn't wedge the queue
            await bumpOutboxFailure(db, row.seq, 'parked', `${e.status} ${e.message}`);
            continue;
          }
        }
        // network / 5xx: keep pending, stop, retry on next trigger
        await bumpOutboxFailure(db, row.seq, 'pending', String(e));
        break;
      }
    }
  } finally {
    await refreshPending();
  }
}

/**
 * Wire connectivity: feed react-query's onlineManager from NetInfo and drain the outbox
 * whenever we regain connectivity. Returns an unsubscribe for the drain listener.
 */
export function startSync(): () => void {
  onlineManager.setEventListener(setOnline =>
    NetInfo.addEventListener(state => setOnline(!!state.isConnected)),
  );
  const unsub = NetInfo.addEventListener(state => {
    const online = !!state.isConnected;
    useSyncStatus.getState().setOnline(online);
    if (online) void drainOutbox();
  });
  void refreshPending();
  return unsub;
}
