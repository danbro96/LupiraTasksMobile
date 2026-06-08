// Client-side item event types — the exact shapes the offline outbox queues and the
// LWW reducer (itemLww.ts) folds into ItemState. They mirror the server's
// Domain/Items/ItemEvents.cs records 1:1 (every event carries `occurredAt` + `commandId`)
// so the same conflict-resolution rules run on both sides and converge.

export type Iso = string; // ISO-8601 UTC instant, millisecond precision
export type Guid = string; // canonical lowercase, hyphenated GUID

export type ItemEvent =
  | { type: 'ItemAdded'; itemId: Guid; listId: Guid; parentItemId: Guid | null; title: string; sortOrder: string; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemRenamed'; itemId: Guid; title: string; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemNotesEdited'; itemId: Guid; notes: string | null; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemAssigned'; itemId: Guid; assigneeEmail: string | null; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemDueDateSet'; itemId: Guid; dueAt: Iso | null; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemTagAdded'; itemId: Guid; tagId: Guid; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemTagRemoved'; itemId: Guid; tagId: Guid; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemQuantitySet'; itemId: Guid; quantity: number | null; unit: string | null; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemCompleted'; itemId: Guid; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemReopened'; itemId: Guid; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemMoved'; itemId: Guid; parentItemId: Guid | null; sortOrder: string; occurredAt: Iso; commandId: Guid }
  | { type: 'ItemDeleted'; itemId: Guid; occurredAt: Iso; commandId: Guid };

export type ItemEventType = ItemEvent['type'];
