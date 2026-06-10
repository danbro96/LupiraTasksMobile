import type { ItemState } from './itemState';
import { buildVisibleRows } from './itemTree';

// Pure CSV serialization for exporting a list's tasks. Framework-free (no RN/Expo imports) so
// it lives in the domain layer and is unit-tested in node (see exportTasks.test.ts). The UI
// hands the returned string to Share.share({ message }).

const COLUMNS = [
  'level',
  'title',
  'completed',
  'notes',
  'due',
  'assignedTo',
  'quantity',
  'unit',
  'tags',
  'completedAt',
  'createdAt',
] as const;

/** RFC-4180 field escaping: quote the value when it holds a comma, quote, or newline, doubling
 *  any embedded quote. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const cell = (v: string | number | boolean | null): string => (v == null ? '' : csvField(String(v)));

/**
 * Serialize a list's tasks to CSV. Rows are depth-first (each subtask under its parent, in
 * sort order) with a `level` column carrying the nesting depth, so spreadsheets show the
 * hierarchy. Includes every task regardless of completion; tag ids are resolved to labels via
 * `tagLabels`, falling back to the raw id when a label is missing.
 */
export function tasksToCsv(items: ItemState[], tagLabels: Map<string, string>): string {
  // Every id "expanded" + hideCompleted=false → a complete depth-first flatten with depth.
  const rows = buildVisibleRows(items, new Set(items.map(i => i.id)), false);
  const lines = [COLUMNS.join(',')];
  for (const { item, depth } of rows) {
    const tags = item.tags.map(id => tagLabels.get(id) ?? id).join('; ');
    lines.push(
      [
        cell(depth),
        cell(item.title),
        cell(item.completed),
        cell(item.notes),
        cell(item.dueAt),
        cell(item.assignedTo),
        cell(item.quantity),
        cell(item.unit),
        cell(tags),
        cell(item.completedAt),
        cell(item.createdAt),
      ].join(','),
    );
  }
  return lines.join('\n');
}
