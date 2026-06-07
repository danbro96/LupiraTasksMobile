import { useAuth } from '../store/auth-store';
import { classifyReplayError, type ReplayDecision } from './replayError';
import { applyItemEvent } from './itemLww';
import { emptyItemState } from './itemState';
import {
  getDb, getItemState, putItemState, putListDoc, insertOutbox,
  pendingOutbox, pendingCount, deleteOutbox, bumpOutboxFailure, parkedCount, parkedOutbox, requeueOutbox,
  getListDoc, deleteListLocal,
} from './db';
import { type ClientOp, opToEvents } from './ops';
import { applyListOp } from './listDoc';
import type { ListResponse } from '../api/generated/models';
import { useSyncStatus, bumpMirror } from './syncStatus';
import { logDebug } from '../debug/log';

export { bumpMirror } from './syncStatus';

export async function refreshPending(): Promise<void> {
  const db = await getDb();
  useSyncStatus.getState().setPending(await pendingCount(db));
}

export async function refreshFailed(): Promise<void> {
  const db = await getDb();
  useSyncStatus.getState().setFailed(await parkedCount(db));
}

/** A parked op surfaced to the "Sync issues" recovery UI: its id, the action, and why it failed. */
export interface ParkedOp {
  seq: number;
  op: ClientOp;
  lastError: string | null;
}

export async function listParked(): Promise<ParkedOp[]> {
  const db = await getDb();
  return (await parkedOutbox(db)).map(r => ({ seq: r.seq, op: JSON.parse(r.op_json) as ClientOp, lastError: r.last_error }));
}

/** Re-queue every parked op (reset attempts) and kick a fresh drain. */
export async function retryParked(): Promise<void> {
  const db = await getDb();
  for (const r of await parkedOutbox(db)) await requeueOutbox(db, r.seq);
  await refreshPending();
  await refreshFailed();
  void drainOutbox();
}

/** Permanently drop a parked op the user has chosen to abandon. */
export async function discardParked(seq: number): Promise<void> {
  const db = await getDb();
  await deleteOutbox(db, seq);
  await refreshFailed();
  bumpMirror();
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

  try {
    await db.withTransactionAsync(async () => {
      for (const ev of opToEvents(op)) {
        const prev = (await getItemState(db, ev.itemId)) ?? emptyItemState();
        await putItemState(db, applyItemEvent(prev, ev, who));
      }
      if (op.kind === 'list.create') {
        await putListDoc(db, { id: op.listId, archived: false, deleted: false, updatedAt: op.occurredAt, doc: optimisticListDoc(op, who) });
      } else if (op.kind.startsWith('list.')) {
        // Optimistically patch the mirrored list doc (rename/recolor/membership). A null patch
        // means the change deleted the list locally (last owner leaving).
        const current = await getListDoc<ListResponse>(db, op.listId);
        if (current) {
          const patched = applyListOp(current, op, who);
          if (patched === null) {
            await deleteListLocal(db, op.listId);
          } else {
            await putListDoc(db, { id: patched.id, archived: patched.isArchived, deleted: false, updatedAt: patched.updatedAt, doc: patched });
          }
        }
      }
      await insertOutbox(db, op.commandId, JSON.stringify(op), op.occurredAt);
    });
  } catch (e) {
    logDebug('enqueue:error', `${op.kind} ${String(e)}`);
    throw e;
  }
  logDebug('enqueue:ok', op.kind === 'list.create' ? `list ${op.listId}` : op.kind);

  await refreshPending();
  bumpMirror();
  void drainOutbox();
}

/** Reconstruct the original per-outcome debug detail (the bug case needs the live stack). */
function replayLogDetail(d: ReplayDecision, e: unknown, opKind: string): string {
  if (d.logTag === 'replay:401') return opKind;
  if (d.logTag === 'replay:bug') {
    const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : '';
    return `${opKind} ${String(e)} :: ${stack}`;
  }
  return `${opKind} ${(d.rowError ?? '').slice(0, 200)}`;
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
        logDebug('replay:ok', op.kind);
      } catch (e) {
        // Classify (pure, tested in replayError.test.ts), then apply the decision.
        const status = useSyncStatus.getState();
        const d = classifyReplayError(e, op.kind);
        if (d.rowStatus) await bumpOutboxFailure(db, row.seq, d.rowStatus, d.rowError ?? '');
        if (d.serverUnreachable) status.setServerReachable(false);
        if (d.lastError !== null) status.setLastError(d.lastError);
        logDebug(d.logTag, replayLogDetail(d, e, op.kind));
        if (d.stop) break;
        continue;
      }
    }
  } finally {
    await refreshPending();
    useSyncStatus.getState().setFailed(await parkedCount(db));
  }
}
