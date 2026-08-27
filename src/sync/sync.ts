import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { authPort } from '../data/api/authProvider';
import { syncList } from '../data/api/generated/sync/sync';
import { listLists } from '../data/api/generated/lists/lists';
import { getMe } from '../data/api/generated/me/me';
import {
  getDb, getItemState, putItemState, putListDoc, pendingOutbox, pendingOutboxForList,
  getListIds, deleteListLocal, deleteItemsNotIn, withWriteTxn, type OutboxRow,
} from '../data/db';
import { listIdsOf, rowsForList } from '../domain/outboxScope';
import { itemResponseToState } from '../domain/itemMap';
import { emptyItemState } from '../domain/itemState';
import { applyItemEvent } from '../domain/itemLww';
import { type ClientOp, opToEvents } from '../domain/ops';
import { applyListOps } from '../domain/listDoc';
import { bumpMirror, useSyncStatus } from './syncStatus';
import { drainOutbox, refreshPending, refreshFailed } from './outbox';
import { listsToPrune } from '../domain/pruneLists';
import { logDebug } from '../debug/log';
import { isNetworkError } from '../data/api/mutator';

/** Provision + cache the caller's `/me` profile (best-effort; non-fatal on failure). */
export async function pullMe(): Promise<void> {
  try {
    const r = await getMe();
    if (r.status !== 200) return; // narrowing only — apiFetch throws on non-2xx
    await authPort().applyProfile({ principalId: r.data.principalId, displayName: r.data.displayName ?? null, isAdmin: r.data.isAdmin });
  } catch (e) {
    if (isNetworkError(e)) throw e; // let runSync mark the server unreachable
    logDebug('pullMe:error', e instanceof Error ? e.message : String(e));
  }
}

/** Rows from both reads, deduped by seq, in seq order (preserves causal op order). */
function unionBySeq(a: OutboxRow[], b: OutboxRow[]): OutboxRow[] {
  const bySeq = new Map<number, OutboxRow>();
  for (const r of [...a, ...b]) bySeq.set(r.seq, r);
  return [...bySeq.values()].sort((x, y) => x.seq - y.seq);
}

/**
 * Pull the caller's lists (active + archived) into the mirror and prune ones they no longer have
 * access to (guarding lists with un-pushed local ops). Returns the ACTIVE list ids — item pulls
 * stay scoped to active lists; an archived list's items re-arrive after restore → push → pull.
 */
export async function pullLists(): Promise<string[]> {
  const db = await getDb();
  // Snapshot BEFORE the GETs: an op acked while a response is already in flight (its outbox row
  // deleted by the drain) must still protect its list — the response predates the server apply.
  const preProtected = listIdsOf(await pendingOutbox(db));
  const [active, archived] = await Promise.all([listLists(), listLists({ archived: true })]);
  if (active.status !== 200 || archived.status !== 200) return getListIds(db); // narrowing only — apiFetch throws on non-2xx

  const serverLists = [...active.data, ...archived.data];
  const serverIds = serverLists.map(l => l.id);
  const mirrorIds = await getListIds(db);

  // Lists referenced by a PENDING outbox row must survive a prune — otherwise a freshly-created
  // list whose push hasn't succeeded yet would be wiped. Parked rows do NOT protect: a parked op
  // on a server-deleted list would otherwise zombie that list forever (it can never reconcile);
  // the user clears parked ops from the "Sync issues" view instead.
  const pendingRows = await pendingOutbox(db);
  const protectedIds = new Set([...preProtected, ...listIdsOf(pendingRows)]);

  const toPrune = listsToPrune(mirrorIds, serverIds, protectedIds);
  logDebug('pullLists', `server=${serverIds.length} mirror=${mirrorIds.length} protected=${protectedIds.size} prune=${toPrune.length}`);

  const self = authPort().getSelf();
  await withWriteTxn(async tx => {
    for (const list of serverLists) {
      // Re-apply the list's pending list.* ops so a not-yet-pushed rename/archive isn't visually
      // reverted by the server doc; null = a pending local delete — don't resurrect.
      const ops = rowsForList(pendingRows, list.id).map(r => JSON.parse(r.op_json) as ClientOp);
      const doc = applyListOps(list, ops, self);
      if (doc === null) continue;
      await putListDoc(tx, { id: doc.id, archived: doc.isArchived, updatedAt: doc.updatedAt, doc });
    }
    for (const id of toPrune) {
      await deleteListLocal(tx, id);
      logDebug('prune', id);
    }
  });

  bumpMirror('pull');
  return active.data.map(l => l.id);
}

/**
 * Pull a list's current state and rebase: write the server base into the mirror, then re-apply
 * not-yet-acked outbox ops on top (so local offline edits survive a refresh). The payload is the
 * full set of live items, so anything else local is deleted server-side and removed here —
 * except what the rebase recreates. Parked ops neither rebase nor survive the deletion pass
 * (same rule as the prune above: they can never reconcile; the user resolves them in Sync Issues).
 */
export async function pullList(listId: string): Promise<void> {
  const db = await getDb();
  // Snapshot BEFORE the GET: an op acked while the response is already in flight (row deleted by
  // the drain) must still rebase — the server base predates its apply. Re-applying an acked op
  // is a no-op under the LWW guards.
  const preRows = await pendingOutboxForList(db, listId);
  const r = await syncList(listId, {});
  if (r.status !== 200) return; // narrowing only — apiFetch throws on non-2xx
  const sync = r.data;
  const who = authPort().getActor();
  const self = authPort().getSelf();

  await withWriteTxn(async tx => {
    const rows = unionBySeq(preRows, await pendingOutboxForList(tx, listId));
    const ops = rows.map(row => JSON.parse(row.op_json) as ClientOp);

    // Rebase pending list.* ops onto the server doc; null = a pending list.delete or
    // last-owner-leave — remove the list locally rather than resurrect it.
    const doc = applyListOps(sync.list, ops, self);
    if (doc === null) {
      await deleteListLocal(tx, listId);
      return;
    }
    await putListDoc(tx, { id: doc.id, archived: doc.isArchived, updatedAt: doc.updatedAt, doc });

    // Deletion pass, then upserts. Locally-created items (pending item.create) are removed here
    // and recreated by the rebase below.
    await deleteItemsNotIn(tx, listId, sync.items.map(i => i.id));
    for (const it of sync.items) {
      await putItemState(tx, itemResponseToState(it));
    }

    // Rebase: re-apply this list's not-yet-acked local ops on top of the server base. Scoped to
    // the list so pulling N lists doesn't re-apply (and re-write) every other list's ops N times.
    for (const op of ops) {
      if (op.kind === 'list.create') continue;
      for (const ev of opToEvents(op)) {
        const prev = await getItemState(tx, ev.itemId);
        // A pending edit to a server-deleted item must not seed a ghost row from empty state —
        // the item stays deleted and the op parks on replay (404) for the Sync Issues view.
        if (!prev && ev.type !== 'ItemAdded') continue;
        await putItemState(tx, applyItemEvent(prev ?? emptyItemState(), ev, who));
      }
    }
  });

  bumpMirror('pull');
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
  const token = await authPort().refresh();
  if (!token) { logDebug('sync:skip', 'no token'); return; } // not signed in — stay on cached mirror.
  logDebug('sync:start');
  const status = useSyncStatus.getState();
  try {
    await pullMe();
    await drainOutbox();
    const ids = await pullLists();
    for (const id of ids) {
      try {
        await pullList(id);
      } catch (e) {
        if (isNetworkError(e)) throw e; // offline — stop; the outer catch marks the server unreachable
        // e.g. a 404 for a list deleted since the ids were fetched — skip it, pull the rest.
        logDebug('pullList:error', `${id} ${e instanceof Error ? e.message : String(e)}`);
      }
    }
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
  const authSub = authPort().onSignIn(() => void syncAll());
  void refreshPending();
  void refreshFailed(); // parked rows survive a relaunch — rehydrate the failed badge too
  return () => { netSub(); appSub.remove(); authSub(); };
}
