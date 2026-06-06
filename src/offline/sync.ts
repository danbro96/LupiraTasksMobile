import { useAuth } from '../store/auth-store';
import { getListsListIdSync } from '../api/generated/sync/sync';
import type { ItemResponse } from '../api/generated/models';
import { getDb, getItemState, putItemState, putListDoc, pendingOutbox, setCursor } from './db';
import { type ItemState, ZERO_GUID, emptyItemState } from './itemState';
import { applyItemEvent } from './itemLww';
import { type ClientOp, opToEvents } from './ops';
import { bumpMirror } from './outbox';

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? Number(v) : v;
}

/**
 * Server snapshot → mirror ItemState. The /sync endpoint returns current values, not
 * events, so we seed every per-field guard at the item's `updatedAt`: a pending local
 * edit with a later `occurredAt` then wins on rebase, an older one loses (v1 uses a single
 * uniform guard per item — good enough at family scale; per-field guards are a later refinement).
 */
function itemResponseToState(r: ItemResponse): ItemState {
  const ts = r.updatedAt;
  const tagTs: Record<string, string> = {};
  const tagCmd: Record<string, string> = {};
  for (const t of r.tags) { tagTs[t] = ts; tagCmd[t] = ZERO_GUID; }
  return {
    id: r.id, listId: r.listId, parentItemId: r.parentItemId ?? null,
    title: r.title, notes: r.notes ?? null,
    completed: r.completed, completedAt: r.completedAt ?? null, completedBy: r.completedBy ?? null,
    assignedTo: r.assignedTo ?? null, dueAt: r.dueAt ?? null,
    quantity: num(r.quantity), unit: r.unit ?? null,
    tags: [...r.tags], sortOrder: r.sortOrder,
    createdBy: r.createdBy ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
    deleted: false,
    nameTs: ts, nameCmd: ZERO_GUID, notesTs: ts, notesCmd: ZERO_GUID,
    assigneeTs: ts, assigneeCmd: ZERO_GUID, dueTs: ts, dueCmd: ZERO_GUID,
    qtyTs: ts, qtyCmd: ZERO_GUID, completedTs: ts, completedCmd: ZERO_GUID, moveTs: ts, moveCmd: ZERO_GUID,
    tagTs, tagCmd,
  };
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

    // Rebase: re-apply non-acked local ops on top of the server base.
    for (const row of await pendingOutbox(db)) {
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
