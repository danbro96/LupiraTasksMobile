import { oneLine } from './text';

// Pure CSV-import parsing — the inverse of exportTasks.ts. Framework-free (domain layer),
// unit-tested in node (see importTasks.test.ts). Two accepted shapes:
//  - our own export format (header row `level,title,completed,notes,…`): level/title/completed/
//    notes/quantity/unit are imported, other columns ignored;
//  - anything else: every non-empty line becomes a top-level task title (no field splitting,
//    so plain lists with commas stay intact).

export interface ImportedTask {
  title: string;
  level: number;
  completed: boolean;
  notes: string | null;
  quantity: number | null;
  unit: string | null;
}

export type ImportParseResult = { ok: true; tasks: ImportedTask[] } | { ok: false; error: string };

export const IMPORT_MAX_TASKS = 500;

/** RFC-4180 tokenizer: rows of fields; quoted fields may hold commas, doubled quotes, and
 *  line breaks. Accepts \r\n and \n row endings. */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  endRow();
  return rows;
}

const parseNum = (v: string | undefined): number | null => {
  const s = (v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const parseBool = (v: string | undefined): boolean =>
  ['true', '1', 'yes'].includes((v ?? '').trim().toLowerCase());

const cleanTitle = (v: string | undefined): string => oneLine(v ?? '').trim();

/** Parse pasted text into importable tasks (see module header for the accepted shapes). */
export function parseCsvTasks(text: string): ImportParseResult {
  if (!text.trim()) return { ok: false, error: 'Nothing to import.' };

  const rows = tokenize(text);
  const header = rows[0]?.map(f => f.trim().toLowerCase()) ?? [];
  const isExportFormat = header[0] === 'level' && header[1] === 'title';

  let tasks: ImportedTask[];
  if (isExportFormat) {
    const col = (name: string) => header.indexOf(name);
    const iLevel = col('level');
    const iTitle = col('title');
    const iCompleted = col('completed');
    const iNotes = col('notes');
    const iQty = col('quantity');
    const iUnit = col('unit');
    tasks = [];
    let prevLevel = -1;
    for (const r of rows.slice(1)) {
      const title = cleanTitle(r[iTitle]);
      if (!title) continue;
      // Clamp level: non-negative integer, at most one deeper than the previous task — a row
      // can't be the child of a parent that doesn't exist.
      const rawLevel = Math.max(0, Math.trunc(parseNum(r[iLevel]) ?? 0));
      const level = Math.min(rawLevel, prevLevel + 1);
      prevLevel = level;
      const notes = iNotes >= 0 ? (r[iNotes] ?? '').trim() : '';
      const unit = iUnit >= 0 ? (r[iUnit] ?? '').trim() : '';
      tasks.push({
        title,
        level,
        completed: iCompleted >= 0 && parseBool(r[iCompleted]),
        notes: notes || null,
        quantity: iQty >= 0 ? parseNum(r[iQty]) : null,
        unit: unit || null,
      });
    }
  } else {
    // Plain text: one task per line, untouched by field splitting.
    tasks = text
      .split(/\r?\n/)
      .map(line => cleanTitle(line))
      .filter(Boolean)
      .map(title => ({ title, level: 0, completed: false, notes: null, quantity: null, unit: null }));
  }

  if (tasks.length === 0) return { ok: false, error: 'No tasks found in the pasted text.' };
  if (tasks.length > IMPORT_MAX_TASKS) {
    return { ok: false, error: `Too many tasks (${tasks.length}) — the limit is ${IMPORT_MAX_TASKS}.` };
  }
  return { ok: true, tasks };
}
