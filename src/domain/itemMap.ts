import type { ItemDto } from '../data/api/generated/models';
import { type ItemState, ZERO_GUID } from './itemState';

// Server snapshot → mirror ItemState mapping. Pure (no SQLite/API), so the seeding rules are
// unit-testable on their own.

/**
 * The /sync endpoint returns current values, not events, so we seed every per-field guard at
 * the item's `updatedAt`: a pending local edit with a later `occurredAt` then wins on rebase,
 * an older one loses (v1 uses a single uniform guard per item — good enough at family scale;
 * per-field guards are a later refinement).
 */
export function itemResponseToState(r: ItemDto): ItemState {
  const ts = r.updatedAt;
  const tagTs: Record<string, string> = {};
  const tagCmd: Record<string, string> = {};
  for (const t of r.tags) { tagTs[t] = ts; tagCmd[t] = ZERO_GUID; }
  return {
    id: r.id, listId: r.listId, parentItemId: r.parentItemId ?? null,
    title: r.title, notes: r.notes ?? null,
    completed: r.completed, completedAt: r.completedAt ?? null, completedBy: r.completedBy?.principalId ?? null,
    assignedTo: r.assignee?.principalId ?? null, dueAt: r.dueAt ?? null,
    quantity: r.quantity ?? null, unit: r.unit ?? null,
    priority: r.priority ?? 0,
    tags: [...r.tags], sortOrder: r.sortOrder,
    createdBy: r.createdBy?.principalId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
    deleted: false,
    nameTs: ts, nameCmd: ZERO_GUID, notesTs: ts, notesCmd: ZERO_GUID,
    assigneeTs: ts, assigneeCmd: ZERO_GUID, dueTs: ts, dueCmd: ZERO_GUID,
    qtyTs: ts, qtyCmd: ZERO_GUID, priorityTs: ts, priorityCmd: ZERO_GUID, completedTs: ts, completedCmd: ZERO_GUID, moveTs: ts, moveCmd: ZERO_GUID,
    tagTs, tagCmd,
  };
}
