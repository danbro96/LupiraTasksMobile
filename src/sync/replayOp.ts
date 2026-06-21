import type { ClientOp } from '../domain/ops';
import {
  postListsListIdItems,
  patchListsListIdItemsItemId,
  postListsListIdItemsItemIdComplete,
  postListsListIdItemsItemIdReopen,
  postListsListIdItemsItemIdMove,
  deleteListsListIdItemsItemId,
} from '../data/api/generated/items/items';
import {
  postLists,
  patchListsListId,
  deleteListsListId,
  postListsListIdArchive,
  postListsListIdRestore,
  postListsListIdMembers,
  patchListsListIdMembersMemberEmail,
  deleteListsListIdMembersMemberEmail,
} from '../data/api/generated/lists/lists';

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
    case 'item.priority':
      await patchListsListIdItemsItemId(op.listId, op.itemId, { priority: op.priority, priorityProvided: true, occurredAt }, idem);
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
    case 'list.setSimplePriority':
      await patchListsListId(op.listId, { simplePriority: op.simplePriority }, idem);
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
