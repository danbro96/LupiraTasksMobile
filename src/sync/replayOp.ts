import type { ClientOp } from '../domain/ops';
import {
  createListItem,
  updateListItem,
  completeItem,
  reopenItem,
  moveItem,
  deleteListItem,
} from '../data/api/generated/items/items';
import {
  createList,
  updateList,
  deleteList,
  archiveList,
  restoreList,
  reorderListItems,
  addListMember,
  updateListMember,
  removeListMember,
} from '../data/api/generated/lists/lists';

/** Replay an op against the API. The generated fns inject the bearer + throw ApiError on non-2xx. */
export async function replayOp(op: ClientOp): Promise<void> {
  const idem: RequestInit = { headers: { 'Idempotency-Key': op.commandId } };
  const { occurredAt } = op;
  switch (op.kind) {
    case 'item.create':
      await createListItem(op.listId, { id: op.itemId, title: op.title, sortOrder: op.sortOrder, parentItemId: op.parentItemId, occurredAt }, idem);
      return;
    case 'item.rename':
      await updateListItem(op.listId, op.itemId, { title: op.title, titleProvided: true, occurredAt }, idem);
      return;
    case 'item.notes':
      await updateListItem(op.listId, op.itemId, { notes: op.notes, notesProvided: true, occurredAt }, idem);
      return;
    case 'item.assign':
      await updateListItem(op.listId, op.itemId, { assigneeEmail: op.assigneeEmail, assigneeEmailProvided: true, occurredAt }, idem);
      return;
    case 'item.due':
      await updateListItem(op.listId, op.itemId, { dueAt: op.dueAt, dueAtProvided: true, occurredAt }, idem);
      return;
    case 'item.quantity':
      await updateListItem(op.listId, op.itemId, { quantity: op.quantity, unit: op.unit, quantityProvided: true, occurredAt }, idem);
      return;
    case 'item.priority':
      await updateListItem(op.listId, op.itemId, { priority: op.priority, priorityProvided: true, occurredAt }, idem);
      return;
    case 'item.tagAdd':
      await updateListItem(op.listId, op.itemId, { addTagIds: [op.tagId], occurredAt }, idem);
      return;
    case 'item.tagRemove':
      await updateListItem(op.listId, op.itemId, { removeTagIds: [op.tagId], occurredAt }, idem);
      return;
    case 'item.complete':
      await completeItem(op.listId, op.itemId, { occurredAt }, idem);
      return;
    case 'item.reopen':
      await reopenItem(op.listId, op.itemId, { occurredAt }, idem);
      return;
    case 'item.move':
      await moveItem(op.listId, op.itemId, { sortOrder: op.sortOrder, parentItemId: op.parentItemId, occurredAt }, idem);
      return;
    case 'item.delete':
      await deleteListItem(op.listId, op.itemId, { occurredAt }, idem);
      return;
    case 'list.create':
      await createList({ id: op.listId, name: op.name, kind: op.listKind, color: op.color }, idem);
      return;
    case 'list.rename':
      await updateList(op.listId, { name: op.name }, idem);
      return;
    case 'list.recolor':
      await updateList(op.listId, { color: op.color, colorProvided: true }, idem);
      return;
    case 'list.setSimplePriority':
      await updateList(op.listId, { simplePriority: op.simplePriority }, idem);
      return;
    case 'list.reorder':
      await reorderListItems(op.listId, { sortOrder: op.sortOrder }, idem);
      return;
    case 'list.memberAdd':
      await addListMember(op.listId, { email: op.email, role: op.role }, idem);
      return;
    case 'list.memberRoleChange':
      await updateListMember(op.listId, op.principalId, { role: op.role }, idem);
      return;
    case 'list.memberRemove':
    case 'list.leave':
      await removeListMember(op.listId, op.principalId, idem);
      return;
    case 'list.delete':
      await deleteList(op.listId, idem);
      return;
    case 'list.archive':
      await archiveList(op.listId, idem);
      return;
    case 'list.restore':
      await restoreList(op.listId, idem);
      return;
  }
}
