import * as Sentry from '@sentry/react-native';
import { authPort } from '../data/api/authProvider';
import { classifyReplayError, type ReplayDecision } from '../domain/replayError';
import { applyItemEvent } from '../domain/itemLww';
import { emptyItemState } from '../domain/itemState';
import {
  getDb, getItemState, putItemState, putListDoc, insertOutbox,
  pendingOutbox, pendingCount, deleteOutbox, bumpOutboxFailure, parkedCount, parkedOutbox, requeueOutbox,
  getListDoc, deleteListLocal,
} from '../data/db';
import { type ClientOp, opToEvents } from '../domain/ops';
import { applyListOp } from '../domain/listDoc';
import type { ListResponse, PersonRef } from '../data/api/generated/models';
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
  return authPort().getActor();
}

/** A best-effort optimistic ListResponse so a list created offline shows immediately. The server
 *  fills in the authoritative owner/members on the next pull; `self` may be null before the first
 *  `/me` resolves the principal id, in which case owner/members stay empty until then. */
function optimisticListDoc(op: Extract<ClientOp, { kind: 'list.create' }>, self: PersonRef | null): ListResponse {
  return {
    id: op.listId,
    version: 0,
    name: op.name,
    kind: op.listKind,
    color: op.color,
    simplePriority: true, // matches the UI's default until the server pull sets the real value
    owner: self ?? { principalId: '', email: '', displayName: null },
    isArchived: false,
    createdAt: op.occurredAt,
    updatedAt: op.occurredAt,
    tags: [],
    members: self ? [{ principalId: self.principalId, email: self.email, displayName: self.displayName ?? null, role: 'Owner', addedAt: op.occurredAt, addedBy: self }] : [],
  };
}

/** Optimistically apply one op to the local mirror (items + list docs). Runs inside the
 *  enqueue transaction; same-transaction reads see earlier writes, so a batch can complete
 *  or annotate an item it created moments before. */
async function applyOpLocally(db: Awaited<ReturnType<typeof getDb>>, op: ClientOp, who: string | null, self: PersonRef | null): Promise<void> {
  for (const ev of opToEvents(op)) {
    const prev = (await getItemState(db, ev.itemId)) ?? emptyItemState();
    await putItemState(db, applyItemEvent(prev, ev, who));
  }
  if (op.kind === 'list.create') {
    await putListDoc(db, { id: op.listId, archived: false, deleted: false, updatedAt: op.occurredAt, doc: optimisticListDoc(op, self) });
  } else if (op.kind.startsWith('list.')) {
    // Optimistically patch the mirrored list doc (rename/recolor/membership). A null patch
    // means the change deleted the list locally (last owner leaving).
    const current = await getListDoc<ListResponse>(db, op.listId);
    if (current) {
      const patched = applyListOp(current, op, self);
      if (patched === null) {
        await deleteListLocal(db, op.listId);
      } else {
        await putListDoc(db, { id: patched.id, archived: patched.isArchived, deleted: false, updatedAt: patched.updatedAt, doc: patched });
      }
    }
  }
}

/**
 * Enqueue a user action: optimistically apply it to the local mirror AND append the
 * durable outbox row in one SQLite transaction, then kick the replay worker. The UI
 * updates immediately and the change survives an app restart while offline.
 */
export function enqueue(op: ClientOp): Promise<void> {
  return enqueueMany([op]);
}

/**
 * Batch variant (e.g. CSV import: list.create + N item ops): one transaction over every op
 * and a single mirror bump, so a large import doesn't trigger a UI reload per op. Outbox rows
 * keep op order, and replay drains FIFO — causal chains (create → complete) hold server-side.
 */
export async function enqueueMany(ops: ClientOp[]): Promise<void> {
  if (ops.length === 0) return;
  const db = await getDb();
  const who = actor();
  const self = authPort().getSelf();

  try {
    await db.withTransactionAsync(async () => {
      for (const op of ops) {
        await applyOpLocally(db, op, who, self);
        await insertOutbox(db, op.commandId, JSON.stringify(op), op.occurredAt);
      }
    });
  } catch (e) {
    // A failed optimistic-apply + enqueue transaction is a genuine client bug (SQLite / reducer),
    // not an expected offline condition — report it.
    Sentry.captureException(e, { tags: { area: 'enqueue', op: ops[0].kind, count: ops.length } });
    logDebug('enqueue:error', `${ops[0].kind}x${ops.length} ${String(e)}`);
    throw e;
  }
  const first = ops[0];
  logDebug('enqueue:ok', ops.length > 1 ? `batch x${ops.length}` : first.kind === 'list.create' ? `list ${first.listId}` : first.kind);

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
    await authPort().refresh(); // ensure replay uses a live access token
    for (;;) {
      const pending = await pendingOutbox(db);
      if (pending.length === 0) break;

      const row = pending[0];
      const op = JSON.parse(row.op_json) as ClientOp;

      try {
        const { replayOp } = await import('./replayOp');
        await replayOp(op);
        await deleteOutbox(db, row.seq);
        logDebug('replay:ok', op.kind);
      } catch (e) {
        // Classify (pure, tested in replayError.test.ts), then apply the decision.
        const status = useSyncStatus.getState();
        const d = classifyReplayError(e, op.kind);
        // A non-HTTP error means a client bug that will fail identically forever — report it.
        // 4xx/5xx/network are expected (handled + surfaced in the Sync Issues UI), so stay quiet.
        if (d.logTag === 'replay:bug') Sentry.captureException(e, { tags: { area: 'outbox', op: op.kind } });
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
