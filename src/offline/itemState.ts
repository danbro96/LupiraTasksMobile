import type { Guid, Iso } from './events';

// Mirror of the server's Domain/Items/ItemState.cs: the item's current fields plus the
// per-field last-writer-wins guards. The reducer (itemLww.ts) is the only thing that
// mutates it. Kept framework-free so it can be unit-tested as the shared convergence
// contract against the server's vectors.

/** All-zero GUID — the guard command id before any event has set a field. */
export const ZERO_GUID: Guid = '00000000-0000-0000-0000-000000000000';

/** Sentinel earlier than any real instant (mirrors default(DateTimeOffset)). */
export const MIN_TS: Iso = '0001-01-01T00:00:00.000Z';

export interface ItemState {
  id: Guid;
  listId: Guid;
  parentItemId: Guid | null;

  title: string;
  notes: string | null;

  completed: boolean;
  completedAt: Iso | null;
  completedBy: string | null;

  assignedTo: string | null;
  dueAt: Iso | null;

  quantity: number | null;
  unit: string | null;

  tags: Guid[];

  sortOrder: string;

  createdBy: string | null;
  createdAt: Iso;
  updatedAt: Iso;

  deleted: boolean;

  // Per-field LWW guards: the (OccurredAt, CommandId) of the event that last set the field.
  nameTs: Iso; nameCmd: Guid;
  notesTs: Iso; notesCmd: Guid;
  assigneeTs: Iso; assigneeCmd: Guid;
  dueTs: Iso; dueCmd: Guid;
  qtyTs: Iso; qtyCmd: Guid;
  completedTs: Iso; completedCmd: Guid;
  moveTs: Iso; moveCmd: Guid;

  // Per-tag last-touched guard, so add/remove deltas converge commutatively.
  tagTs: Record<Guid, Iso>;
  tagCmd: Record<Guid, Guid>;
}

export function emptyItemState(): ItemState {
  return {
    id: '', listId: '', parentItemId: null,
    title: '', notes: null,
    completed: false, completedAt: null, completedBy: null,
    assignedTo: null, dueAt: null,
    quantity: null, unit: null,
    tags: [],
    sortOrder: '',
    createdBy: null, createdAt: MIN_TS, updatedAt: MIN_TS,
    deleted: false,
    nameTs: MIN_TS, nameCmd: ZERO_GUID,
    notesTs: MIN_TS, notesCmd: ZERO_GUID,
    assigneeTs: MIN_TS, assigneeCmd: ZERO_GUID,
    dueTs: MIN_TS, dueCmd: ZERO_GUID,
    qtyTs: MIN_TS, qtyCmd: ZERO_GUID,
    completedTs: MIN_TS, completedCmd: ZERO_GUID,
    moveTs: MIN_TS, moveCmd: ZERO_GUID,
    tagTs: {}, tagCmd: {},
  };
}
