import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../store/auth-store';
import { getListsListIdSync } from '../api/generated/sync/sync';
import { getLists } from '../api/generated/lists/lists';
import { getMe } from '../api/generated/me/me';
import {
  getDb, getItemState, putItemState, putListDoc, pendingOutbox, pendingOutboxForList, setCursor,
  getListIds, deleteListLocal,
} from './db';
import { listIdsOf } from './outboxScope';
import { itemResponseToState } from './itemMap';
import { emptyItemState } from './itemState';
import { applyItemEvent } from './itemLww';
import { type ClientOp, opToEvents } from './ops';
import { bumpMirror, useSyncStatus } from './syncStatus';
import { drainOutbox, refreshPending } from './outbox';
import { listsToPrune } from './pruneLists';
import { logDebug } from '../debug/log';
import { isNetworkError } from '../api/mutator';

/** Provision + cache the caller's `/me` profile (best-effort; non-fatal on failure). */
export async function pullMe(): Promise<void> {
  try {
    const r = await getMe();
    if (r.status !== 200) return;
    await useAuth.getState().updateProfile({ displayName: r.data.displayName ?? null, isAdmin: r.data.isAdmin });
  } catch (e) {
    if (isNetworkError(e)) throw e; // let runSync mark the server unreachable
    logDebug('pullMe:error', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Pull the caller's active lists into the mirror and prune ones they no longer have access to
 * (guarding lists with un-pushed local ops). Returns the server list ids (to pull items for).
 * Falls back to the local ids if the server is unreachable.
 */
export async function pullLists(): Promise<string[]> {
  const r = await getLists();
  const db = await getDb();
  if (r.status !== 200) {
    logDebug('pullLists:non200', String(r.status));
    return getListIds(db);
  }

  const serverLists = r.data.lists;
  const serverIds = serverLists.map(l => l.id);
  const mirrorIds = await getListIds(db);

  // Lists referenced by a PENDING outbox row must survive a prune — otherwise a freshly-created
  // list whose push hasn't succeeded yet would be wiped. Parked rows do NOT protect: a parked op
  // on a server-deleted list would otherwise zombie that list forever (it can never reconcile);
  // the user clears parked ops from the "Sync issues" view instead.
  const protectedIds = listIdsOf(await pendingOutbox(db));

  const toPrune = listsToPrune(mirrorIds, serverIds, protectedIds);
  logDebug('pullLists', `server=${serverIds.length} mirror=${mirrorIds.length} protected=${protectedIds.size} prune=${toPrune.length}`);

  await db.withTransactionAsync(async () => {
    for (const list of serverLists) {
      await putListDoc(db, { id: list.id, archived: list.isArchived, deleted: false, updatedAt: list.updatedAt, doc: list });
    }
    for (const id of toPrune) {
      await deleteListLocal(db, id);
      logDebug('prune', id);
    }
  });

  bumpMirror();
  return serverIds;
}

/**
 * Pull a list's current state and rebase: write the server base into the mirror, then
 * re-apply not-yet-acked outbox ops on top (so local offline edits survive a refresh).
 */
export async function pullList(listId: string): Promise<void> {
  const r = await getListsListIdSync(listId, {});
  if (r.status !== 200) return;
  const sync = r.data;
  const db = await getDb();
  const who = useAuth.getState().user?.sub ?? null;

  await db.withTransactionAsync(async () => {
    const list = sync.list;
    await putListDoc(db, { id: list.id, archived: list.isArchived, deleted: false, updatedAt: list.updatedAt, doc: list });

    for (const it of sync.items) {
      await putItemState(db, itemResponseToState(it));
    }

    // Rebase: re-apply this list's not-yet-acked local ops on top of the server base. Scoped to
    // the list so pulling N lists doesn't re-apply (and re-write) every other list's ops N times.
    for (const row of await pendingOutboxForList(db, listId)) {
      const op = JSON.parse(row.op_json) as ClientOp;
      if (op.kind === 'list.create') continue;
      for (const ev of opToEvents(op)) {
        const prev = (await getItemState(db, ev.itemId)) ?? emptyItemState();
        await putItemState(db, applyItemEvent(prev, ev, who));
      }
    }

    await setCursor(db, listId, String(sync.nextCursor), new Date().toISOString());
  });

  bumpMirror();
}

// Coalesce overlapping full-syncs (foreground + reconnect can fire together).
let syncing: Promise<void> | null = null;

/**
 * Full sync in the plan's push-then-pull order: provision /me, drain the outbox (push local
 * edits), then pull lists + each list's items (which rebases any still-pending edits on top).
 */
export function syncAll(): Promise<void> {
  if (!syncing) syncing = runSync().finally(() => { syncing = null; });
  return syncing;
}

async function runSync(): Promise<void> {
  const token = await useAuth.getState().refreshIfNeeded();
  if (!token) { logDebug('sync:skip', 'no token'); return; } // not signed in — stay on cached mirror.
  logDebug('sync:start');
  const status = useSyncStatus.getState();
  try {
    await pullMe();
    await drainOutbox();
    const ids = await pullLists();
    for (const id of ids) await pullList(id);
    status.setServerReachable(true);
    status.setLastError(null);
    logDebug('sync:done', `lists=${ids.length}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isNetworkError(e)) status.setServerReachable(false);
    status.setLastError(msg);
    logDebug('sync:error', msg);
  } finally {
    // Whether the sync succeeded or failed, the first attempt is done — screens can stop
    // showing the initial-load spinner and fall back to cached data / empty states.
    status.setFirstSyncDone(true);
  }
}

/**
 * Wire connectivity + lifecycle to sync: track online state from NetInfo, run a full sync on
 * regained connectivity, on app foreground, and on sign-in. Returns an unsubscribe.
 */
export function startSync(): () => void {
  const netSub = NetInfo.addEventListener(state => {
    const online = !!state.isConnected;
    useSyncStatus.getState().setOnline(online);
    if (online) void syncAll();
  });
  const appSub = AppState.addEventListener('change', s => {
    if (s === 'active') void syncAll();
  });
  // Sign-in trigger: the access token going absent→present means a fresh login (the mount-effect
  // sync already ran while signed out and no-oped). Without this, a first-install user stays on the
  // initial-load spinner until they manually pull-to-refresh. The strict null→present guard skips
  // the non-null→non-null swap that token rotation performs, and syncAll() self-coalesces, so a
  // race with the mount-effect sync is harmless.
  const authSub = useAuth.subscribe((state, prev) => {
    if (!prev.token && state.token) void syncAll();
  });
  void refreshPending();
  return () => { netSub(); appSub.remove(); authSub(); };
}
