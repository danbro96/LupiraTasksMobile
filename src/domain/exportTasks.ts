import type { ItemState } from './itemState';

// Pure JSON serialization for exporting a list's tasks. Framework-free (no RN/Expo imports) so
// it lives in the domain layer and is unit-tested in node (see exportTasks.test.ts). The UI
// hands the returned string to Share.share({ message }). The shape round-trips back through
// importTasks.ts (parseImport); see that module for which fields are restored on import.

const bySort = (a: ItemState, b: ItemState) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0);

/** Group items by effective parent (a parent that isn't present → the item is a root, so nothing
 *  is dropped). Each group sorted by sortOrder. Mirrors itemTree.buildVisibleRows' tolerance. */
function byParent(items: ItemState[]): Map<string | null, ItemState[]> {
  const ids = new Set(items.map(i => i.id));
  const map = new Map<string | null, ItemState[]>();
  for (const it of items) {
    const parent = it.parentItemId && ids.has(it.parentItemId) ? it.parentItemId : null;
    (map.get(parent) ?? map.set(parent, []).get(parent)!).push(it);
  }
  for (const arr of map.values()) arr.sort(bySort);
  return map;
}

interface JsonTask {
  title: string;
  done?: boolean;
  notes?: string;
  quantity?: number;
  unit?: string;
  due?: string;
  assignee?: string;
  tags?: string[];
  subtasks?: JsonTask[];
}

/**
 * Serialize a list's tasks to a nested JSON document. Subtasks nest under `subtasks`; only
 * non-empty fields are emitted (so a plain checklist stays terse). `done` appears only when the
 * task is completed; `due` is the raw dueAt instant; tag ids are resolved to labels via
 * `tagLabels` (falling back to the raw id). assignee (a principal id) and tags are export-only
 * (not re-imported).
 */
export function tasksToJson(list: { name: string; kind: string }, items: ItemState[], tagLabels: Map<string, string>): string {
  const children = byParent(items);
  const build = (parentId: string | null): JsonTask[] =>
    (children.get(parentId) ?? []).map(item => {
      const task: JsonTask = { title: item.title };
      if (item.completed) task.done = true;
      if (item.notes) task.notes = item.notes;
      if (item.quantity != null) task.quantity = item.quantity;
      if (item.unit) task.unit = item.unit;
      if (item.dueAt) task.due = item.dueAt;
      if (item.assignedTo) task.assignee = item.assignedTo;
      if (item.tags.length) task.tags = item.tags.map(id => tagLabels.get(id) ?? id);
      const subtasks = build(item.id);
      if (subtasks.length) task.subtasks = subtasks;
      return task;
    });
  return JSON.stringify({ version: 1, name: list.name, kind: list.kind, tasks: build(null) }, null, 2);
}
