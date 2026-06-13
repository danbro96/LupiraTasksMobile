import { oneLine } from './text';

// Pure import parsing — the inverse of exportTasks.ts. Framework-free (domain layer), unit-tested
// in node (see importTasks.test.ts). Two accepted shapes:
//  - our own JSON export ({ tasks: [...] } or a bare [...] of task objects): title/done/notes/
//    quantity/unit/due and nested subtasks are imported, other fields (assignee/tags) ignored;
//  - anything else: every non-empty line becomes a top-level task title.
// The nested JSON is flattened to a flat list with a `level` per task so the op-builder
// (ImportListScreen.buildImportOps) stays format-agnostic.

export interface ImportedTask {
  title: string;
  level: number;
  completed: boolean;
  notes: string | null;
  quantity: number | null;
  unit: string | null;
  dueAt: string | null;
}

export type ImportParseResult =
  | { ok: true; tasks: ImportedTask[]; name?: string; kind?: string }
  | { ok: false; error: string };

export const IMPORT_MAX_TASKS = 500;

const cleanTitle = (v: unknown): string => (typeof v === 'string' ? oneLine(v).trim() : '');

const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const asString = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

/** Flatten a nested task tree (depth-first) into the flat ImportedTask list, computing `level`
 *  from nesting depth. Non-object entries and entries without a title are skipped. */
function flatten(nodes: unknown, level: number, out: ImportedTask[]): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const n = node as Record<string, unknown>;
    const title = cleanTitle(n.title);
    if (!title) continue;
    out.push({
      title,
      level,
      completed: n.done === true,
      notes: asString(n.notes),
      quantity: asNum(n.quantity),
      unit: asString(n.unit),
      dueAt: asString(n.due),
    });
    if (Array.isArray(n.subtasks)) flatten(n.subtasks, level + 1, out);
  }
}

/** Parse pasted text into importable tasks (see module header for the accepted shapes). */
export function parseImport(text: string): ImportParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Nothing to import.' };

  let tasks: ImportedTask[];
  let name: string | undefined;
  let kind: string | undefined;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let doc: unknown;
    try {
      doc = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "Couldn't read the JSON — check it was copied in full." };
    }
    const nodes = Array.isArray(doc) ? doc : (doc as Record<string, unknown>)?.tasks;
    tasks = [];
    flatten(nodes, 0, tasks);
    if (!Array.isArray(doc)) {
      name = asString((doc as Record<string, unknown>)?.name) ?? undefined;
      kind = asString((doc as Record<string, unknown>)?.kind) ?? undefined;
    }
  } else {
    // Plain text: one task per line, untouched by any field splitting.
    tasks = trimmed
      .split(/\r?\n/)
      .map(cleanTitle)
      .filter(Boolean)
      .map(title => ({ title, level: 0, completed: false, notes: null, quantity: null, unit: null, dueAt: null }));
  }

  if (tasks.length === 0) return { ok: false, error: 'No tasks found in the pasted text.' };
  if (tasks.length > IMPORT_MAX_TASKS) {
    return { ok: false, error: `Too many tasks (${tasks.length}) — the limit is ${IMPORT_MAX_TASKS}.` };
  }
  return { ok: true, tasks, name, kind };
}
