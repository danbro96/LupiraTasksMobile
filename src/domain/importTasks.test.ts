import { describe, it, expect } from 'vitest';
import { emptyItemState, type ItemState } from './itemState';
import { tasksToCsv } from './exportTasks';
import { parseCsvTasks, IMPORT_MAX_TASKS } from './importTasks';

function item(partial: Partial<ItemState>): ItemState {
  return { ...emptyItemState(), ...partial };
}

describe('parseCsvTasks — export-format round trip', () => {
  it('re-imports what tasksToCsv exported (order, nesting, fields)', () => {
    const items = [
      item({ id: 'P', title: 'Parent', sortOrder: 'a', notes: 'remember', quantity: 2, unit: 'kg' }),
      item({ id: 'C', title: 'Child', parentItemId: 'P', sortOrder: 'a', completed: true }),
      item({ id: 'Q', title: 'a, "quoted"\ntitle', sortOrder: 'b' }),
    ];
    const csv = tasksToCsv(items, new Map());
    const res = parseCsvTasks(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks).toEqual([
      { title: 'Parent', level: 0, completed: false, notes: 'remember', quantity: 2, unit: 'kg' },
      { title: 'Child', level: 1, completed: true, notes: null, quantity: null, unit: null },
      // The export quoted/escaped the messy title; import unescapes and flattens the line break.
      { title: 'a, "quoted" title', level: 0, completed: false, notes: null, quantity: null, unit: null },
    ]);
  });

  it('clamps level jumps to one deeper than the previous task', () => {
    const csv = 'level,title,completed\n0,root,\n5,jumped,\n2,after,';
    const res = parseCsvTasks(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks.map(t => t.level)).toEqual([0, 1, 2]);
  });

  it('accepts true/1/yes (any case) as completed', () => {
    const csv = 'level,title,completed\n0,a,TRUE\n0,b,1\n0,c,yes\n0,d,false\n0,e,';
    const res = parseCsvTasks(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks.map(t => t.completed)).toEqual([true, true, true, false, false]);
  });

  it('skips rows with blank titles', () => {
    const csv = 'level,title,completed\n0,real,\n0,,\n0,   ,';
    const res = parseCsvTasks(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks.map(t => t.title)).toEqual(['real']);
  });
});

describe('parseCsvTasks — plain text fallback', () => {
  it('treats each non-empty line as a title without splitting on commas', () => {
    const res = parseCsvTasks('Milk, 2L\n\nBread\n  Eggs  \n');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks).toEqual([
      { title: 'Milk, 2L', level: 0, completed: false, notes: null, quantity: null, unit: null },
      { title: 'Bread', level: 0, completed: false, notes: null, quantity: null, unit: null },
      { title: 'Eggs', level: 0, completed: false, notes: null, quantity: null, unit: null },
    ]);
  });
});

describe('parseCsvTasks — errors', () => {
  it('rejects empty input', () => {
    expect(parseCsvTasks('   \n ')).toEqual({ ok: false, error: 'Nothing to import.' });
  });

  it('rejects a header with no task rows', () => {
    const res = parseCsvTasks('level,title,completed\n');
    expect(res.ok).toBe(false);
  });

  it('rejects more than the task cap', () => {
    const lines = Array.from({ length: IMPORT_MAX_TASKS + 1 }, (_, i) => `task ${i}`).join('\n');
    const res = parseCsvTasks(lines);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(String(IMPORT_MAX_TASKS));
  });
});
