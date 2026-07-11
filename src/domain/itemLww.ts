import type { Guid, Iso, ItemEvent } from './events';
import { type ItemState, emptyItemState } from './itemState';

// Pure last-writer-wins reducer for an item — the client mirror of the server's
// Domain/Items/ItemLww.cs. Same rules, so the server snapshot and this reducer converge
// on identical state regardless of the order offline edits sync:
//
//  * Per-field LWW keyed on (occurredAt, commandId): write only when strictly newer —
//    later occurredAt, or equal occurredAt with a greater commandId. Equal pair (a replay)
//    is a no-op (idempotent).
//  * Tag add/remove are commutative per-tag deltas resolved by (occurredAt, commandId).
//  * ItemDeleted is a permanent tombstone checked first in every field apply.
//
// The commandId tiebreak is an ORDINAL comparison of the canonical lowercase GUID string —
// the exact same rule as the server's ItemLww.CompareCommandId (string.CompareOrdinal),
// NOT .NET Guid.CompareTo, so the two implementations agree byte-for-byte.

/** Ordinal compare of two canonical lowercase GUID strings. */
function compareCommandId(a: Guid, b: Guid): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function wins(occurredAt: Iso, commandId: Guid, guardTs: Iso, guardCmd: Guid): boolean {
  const t = Date.parse(occurredAt);
  const g = Date.parse(guardTs);
  return t > g || (t === g && compareCommandId(commandId, guardCmd) > 0);
}

function clone(s: ItemState): ItemState {
  return { ...s, tags: [...s.tags], tagTs: { ...s.tagTs }, tagCmd: { ...s.tagCmd } };
}

function touch(s: ItemState, at: Iso): void {
  if (Date.parse(at) > Date.parse(s.updatedAt)) s.updatedAt = at;
}

function newerTag(s: ItemState, tagId: Guid, occurredAt: Iso, commandId: Guid): boolean {
  const lastTs = s.tagTs[tagId];
  if (lastTs === undefined) return true;
  return wins(occurredAt, commandId, lastTs, s.tagCmd[tagId] ?? '00000000-0000-0000-0000-000000000000');
}

/**
 * Apply one event to the previous state, returning a NEW state (the input is not mutated).
 * `actor` is the acting user's principal id (matches the server's PersonRef.principalId), used
 * for created/completed-by so optimistic attribution converges with the server pull.
 */
export function applyItemEvent(prev: ItemState, e: ItemEvent, actor: string | null): ItemState {
  const s = clone(prev);
  switch (e.type) {
    case 'ItemAdded':
      s.id = e.itemId;
      s.listId = e.listId;
      s.parentItemId = e.parentItemId;
      s.title = e.title;
      s.sortOrder = e.sortOrder;
      s.createdBy = actor;
      s.createdAt = e.occurredAt;
      s.updatedAt = e.occurredAt;
      s.nameTs = e.occurredAt; s.nameCmd = e.commandId;
      s.moveTs = e.occurredAt; s.moveCmd = e.commandId;
      return s;

    case 'ItemRenamed':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.nameTs, s.nameCmd)) return s;
      s.title = e.title; s.nameTs = e.occurredAt; s.nameCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemNotesEdited':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.notesTs, s.notesCmd)) return s;
      s.notes = e.notes; s.notesTs = e.occurredAt; s.notesCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemAssigned':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.assigneeTs, s.assigneeCmd)) return s;
      s.assignedTo = e.assigneePrincipalId; s.assigneeTs = e.occurredAt; s.assigneeCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemDueDateSet':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.dueTs, s.dueCmd)) return s;
      s.dueAt = e.dueAt; s.dueTs = e.occurredAt; s.dueCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemQuantitySet':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.qtyTs, s.qtyCmd)) return s;
      s.quantity = e.quantity; s.unit = e.unit; s.qtyTs = e.occurredAt; s.qtyCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemPrioritySet':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.priorityTs, s.priorityCmd)) return s;
      s.priority = e.priority; s.priorityTs = e.occurredAt; s.priorityCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemCompleted':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.completedTs, s.completedCmd)) return s;
      s.completed = true; s.completedAt = e.occurredAt; s.completedBy = actor;
      s.completedTs = e.occurredAt; s.completedCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemReopened':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.completedTs, s.completedCmd)) return s;
      s.completed = false; s.completedAt = null; s.completedBy = null;
      s.completedTs = e.occurredAt; s.completedCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemMoved':
      if (s.deleted || !wins(e.occurredAt, e.commandId, s.moveTs, s.moveCmd)) return s;
      s.parentItemId = e.parentItemId; s.sortOrder = e.sortOrder;
      s.moveTs = e.occurredAt; s.moveCmd = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemTagAdded':
      if (s.deleted || !newerTag(s, e.tagId, e.occurredAt, e.commandId)) return s;
      if (!s.tags.includes(e.tagId)) s.tags.push(e.tagId);
      s.tagTs[e.tagId] = e.occurredAt; s.tagCmd[e.tagId] = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemTagRemoved':
      if (s.deleted || !newerTag(s, e.tagId, e.occurredAt, e.commandId)) return s;
      s.tags = s.tags.filter(t => t !== e.tagId);
      s.tagTs[e.tagId] = e.occurredAt; s.tagCmd[e.tagId] = e.commandId; touch(s, e.occurredAt); return s;

    case 'ItemDeleted':
      s.deleted = true;
      if (Date.parse(e.occurredAt) > Date.parse(s.updatedAt)) s.updatedAt = e.occurredAt;
      return s;
  }
}

/** Fold an ordered event list into a snapshot (the first event must be ItemAdded). */
export function reduceItemEvents(events: ItemEvent[], actor: string | null): ItemState {
  let s = emptyItemState();
  for (const e of events) s = applyItemEvent(s, e, actor);
  return s;
}
