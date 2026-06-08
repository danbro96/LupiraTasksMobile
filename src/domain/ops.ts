import { v7 as uuidv7 } from 'uuid';
import type { Guid, Iso, ItemEvent } from './events';
import type { ListKind, ListRole } from '../data/api/generated/models';

// A ClientOp is one user action. It is the unit the outbox persists and optimistically applies to
// the local mirror (via opToEvents → the LWW reducer); it is replayed to the API on reconnect by
// replayOp (sync/replayOp.ts), carrying its commandId as the Idempotency-Key so a redelivered
// command is a server-side no-op. This module is the pure half — the type + id/event builders —
// so the domain reducers (listDoc, outboxScope) can depend on the op shape without pulling in HTTP.

interface Base {
  commandId: Guid;
  occurredAt: Iso;
}

export type ClientOp =
  | (Base & { kind: 'item.create'; listId: Guid; itemId: Guid; title: string; sortOrder: string; parentItemId: Guid | null })
  | (Base & { kind: 'item.rename'; listId: Guid; itemId: Guid; title: string })
  | (Base & { kind: 'item.notes'; listId: Guid; itemId: Guid; notes: string | null })
  | (Base & { kind: 'item.assign'; listId: Guid; itemId: Guid; assigneeEmail: string | null })
  | (Base & { kind: 'item.due'; listId: Guid; itemId: Guid; dueAt: Iso | null })
  | (Base & { kind: 'item.quantity'; listId: Guid; itemId: Guid; quantity: number | null; unit: string | null })
  | (Base & { kind: 'item.tagAdd'; listId: Guid; itemId: Guid; tagId: Guid })
  | (Base & { kind: 'item.tagRemove'; listId: Guid; itemId: Guid; tagId: Guid })
  | (Base & { kind: 'item.complete'; listId: Guid; itemId: Guid })
  | (Base & { kind: 'item.reopen'; listId: Guid; itemId: Guid })
  | (Base & { kind: 'item.move'; listId: Guid; itemId: Guid; sortOrder: string; parentItemId: Guid | null })
  | (Base & { kind: 'item.delete'; listId: Guid; itemId: Guid })
  | (Base & { kind: 'list.create'; listId: Guid; name: string; listKind: ListKind; color: string | null })
  | (Base & { kind: 'list.rename'; listId: Guid; name: string })
  | (Base & { kind: 'list.recolor'; listId: Guid; color: string | null })
  | (Base & { kind: 'list.memberAdd'; listId: Guid; email: string; role: ListRole })
  | (Base & { kind: 'list.memberRoleChange'; listId: Guid; email: string; role: ListRole })
  | (Base & { kind: 'list.memberRemove'; listId: Guid; email: string })
  | (Base & { kind: 'list.leave'; listId: Guid; email: string })
  | (Base & { kind: 'list.delete'; listId: Guid })
  | (Base & { kind: 'list.archive'; listId: Guid })
  | (Base & { kind: 'list.restore'; listId: Guid });

/** Stamp a fresh command id + client wall-clock for a new op. */
export function stamp(): Base {
  return { commandId: uuidv7(), occurredAt: new Date().toISOString() };
}

/** GUIDv7 helper for client-generated aggregate ids. */
export function newId(): Guid {
  return uuidv7();
}

/**
 * The item event(s) an op applies to the local mirror for optimistic UI. List ops return
 * [] (the lists mirror is updated separately by the outbox).
 */
export function opToEvents(op: ClientOp): ItemEvent[] {
  const { commandId, occurredAt } = op;
  switch (op.kind) {
    case 'item.create':
      return [{ type: 'ItemAdded', itemId: op.itemId, listId: op.listId, parentItemId: op.parentItemId, title: op.title, sortOrder: op.sortOrder, occurredAt, commandId }];
    case 'item.rename':
      return [{ type: 'ItemRenamed', itemId: op.itemId, title: op.title, occurredAt, commandId }];
    case 'item.notes':
      return [{ type: 'ItemNotesEdited', itemId: op.itemId, notes: op.notes, occurredAt, commandId }];
    case 'item.assign':
      return [{ type: 'ItemAssigned', itemId: op.itemId, assigneeEmail: op.assigneeEmail, occurredAt, commandId }];
    case 'item.due':
      return [{ type: 'ItemDueDateSet', itemId: op.itemId, dueAt: op.dueAt, occurredAt, commandId }];
    case 'item.quantity':
      return [{ type: 'ItemQuantitySet', itemId: op.itemId, quantity: op.quantity, unit: op.unit, occurredAt, commandId }];
    case 'item.tagAdd':
      return [{ type: 'ItemTagAdded', itemId: op.itemId, tagId: op.tagId, occurredAt, commandId }];
    case 'item.tagRemove':
      return [{ type: 'ItemTagRemoved', itemId: op.itemId, tagId: op.tagId, occurredAt, commandId }];
    case 'item.complete':
      return [{ type: 'ItemCompleted', itemId: op.itemId, occurredAt, commandId }];
    case 'item.reopen':
      return [{ type: 'ItemReopened', itemId: op.itemId, occurredAt, commandId }];
    case 'item.move':
      return [{ type: 'ItemMoved', itemId: op.itemId, parentItemId: op.parentItemId, sortOrder: op.sortOrder, occurredAt, commandId }];
    case 'item.delete':
      return [{ type: 'ItemDeleted', itemId: op.itemId, occurredAt, commandId }];
    // List/membership ops don't drive item state; their optimistic effect is applied to the
    // mirrored list doc (see applyListOp in listDoc.ts), so they produce no item events.
    case 'list.create':
    case 'list.rename':
    case 'list.recolor':
    case 'list.memberAdd':
    case 'list.memberRoleChange':
    case 'list.memberRemove':
    case 'list.leave':
    case 'list.delete':
    case 'list.archive':
    case 'list.restore':
      return [];
  }
}
