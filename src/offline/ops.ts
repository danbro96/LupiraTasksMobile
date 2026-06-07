import { v7 as uuidv7 } from 'uuid';
import type { Guid, Iso, ItemEvent } from './events';
import {
  postListsListIdItems,
  patchListsListIdItemsItemId,
  postListsListIdItemsItemIdComplete,
  postListsListIdItemsItemIdReopen,
  postListsListIdItemsItemIdMove,
  deleteListsListIdItemsItemId,
} from '../api/generated/items/items';
import {
  postLists,
  patchListsListId,
  deleteListsListId,
  postListsListIdArchive,
  postListsListIdRestore,
  postListsListIdMembers,
  patchListsListIdMembersMemberEmail,
  deleteListsListIdMembersMemberEmail,
} from '../api/generated/lists/lists';
import type { ListKind, ListRole } from '../api/generated/models';

// A ClientOp is one user action. It is the unit the outbox persists, optimistically
// applies to the local mirror (via opToEvents → the LWW reducer), and replays to the API
// on reconnect (via replayOp) — carrying its commandId as the Idempotency-Key so a
// redelivered command is a server-side no-op.

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

/** Replay an op against the API. The generated fns inject the bearer + throw ApiError on non-2xx. */
export async function replayOp(op: ClientOp): Promise<void> {
  const idem: RequestInit = { headers: { 'Idempotency-Key': op.commandId } };
  const { occurredAt } = op;
  switch (op.kind) {
    case 'item.create':
      await postListsListIdItems(op.listId, { id: op.itemId, title: op.title, sortOrder: op.sortOrder, parentItemId: op.parentItemId, occurredAt }, idem);
      return;
    case 'item.rename':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { title: op.title, titleProvided: true, occurredAt }, idem);
      return;
    case 'item.notes':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { notes: op.notes, notesProvided: true, occurredAt }, idem);
      return;
    case 'item.assign':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { assigneeEmail: op.assigneeEmail, assigneeEmailProvided: true, occurredAt }, idem);
      return;
    case 'item.due':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { dueAt: op.dueAt, dueAtProvided: true, occurredAt }, idem);
      return;
    case 'item.quantity':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { quantity: op.quantity, unit: op.unit, quantityProvided: true, occurredAt }, idem);
      return;
    case 'item.tagAdd':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { addTagIds: [op.tagId], occurredAt }, idem);
      return;
    case 'item.tagRemove':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { removeTagIds: [op.tagId], occurredAt }, idem);
      return;
    case 'item.complete':
      await postListsListIdItemsItemIdComplete(op.listId, op.itemId, { occurredAt }, idem);
      return;
    case 'item.reopen':
      await postListsListIdItemsItemIdReopen(op.listId, op.itemId, { occurredAt }, idem);
      return;
    case 'item.move':
      await postListsListIdItemsItemIdMove(op.listId, op.itemId, { sortOrder: op.sortOrder, parentItemId: op.parentItemId, occurredAt }, idem);
      return;
    case 'item.delete':
      await deleteListsListIdItemsItemId(op.listId, op.itemId, { occurredAt }, idem);
      return;
    case 'list.create':
      await postLists({ id: op.listId, name: op.name, kind: op.listKind, color: op.color }, idem);
      return;
    case 'list.rename':
      await patchListsListId(op.listId, { name: op.name }, idem);
      return;
    case 'list.recolor':
      await patchListsListId(op.listId, { color: op.color, colorProvided: true }, idem);
      return;
    case 'list.memberAdd':
      await postListsListIdMembers(op.listId, { email: op.email, role: op.role }, idem);
      return;
    case 'list.memberRoleChange':
      // The email is a URL path segment — must be percent-encoded ('@', '+', etc.).
      await patchListsListIdMembersMemberEmail(op.listId, encodeURIComponent(op.email), { role: op.role }, idem);
      return;
    case 'list.memberRemove':
    case 'list.leave':
      await deleteListsListIdMembersMemberEmail(op.listId, encodeURIComponent(op.email), idem);
      return;
    case 'list.delete':
      await deleteListsListId(op.listId, idem);
      return;
    case 'list.archive':
      await postListsListIdArchive(op.listId, idem);
      return;
    case 'list.restore':
      await postListsListIdRestore(op.listId, idem);
      return;
  }
}
