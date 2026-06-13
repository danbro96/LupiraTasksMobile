import { describe, it, expect } from 'vitest';
import { emptyItemState, type ItemState } from './itemState';
import { tasksToJson } from './exportTasks';
import { parseImport, IMPORT_MAX_TASKS } from './importTasks';

function item(partial: Partial<ItemState>): ItemState {
  return { ...emptyItemState(), ...partial };
}

describe('parseImport — JSON round trip', () => {
  it('restores order, nesting, and core fields from a tasksToJson document', () => {
    const items = [
      item({ id: 'P', title: 'Parent', sortOrder: 'a', notes: 'remember', quantity: 2, unit: 'kg' }),
      item({ id: 'C', title: 'Child', parentItemId: 'P', sortOrder: 'a', completed: true, dueAt: '2026-06-20T09:00:00.000Z' }),
      item({ id: 'Q', title: 'Sibling', sortOrder: 'b' }),
    ];
    const json = tasksToJson({ name: 'Groceries', kind: 'Shopping' }, items, new Map());
    const res = parseImport(json);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.name).toBe('Groceries');
    expect(res.kind).toBe('Shopping');
    expect(res.tasks).toEqual([
      { title: 'Parent', level: 0, completed: false, notes: 'remember', quantity: 2, unit: 'kg', dueAt: null },
      { title: 'Child', level: 1, completed: true, notes: null, quantity: null, unit: null, dueAt: '2026-06-20T09:00:00.000Z' },
      { title: 'Sibling', level: 0, completed: false, notes: null, quantity: null, unit: null, dueAt: null },
    ]);
  });

  it('accepts a bare array of task objects and skips titleless entries', () => {
    const res = parseImport('[{"title":"A"},{"done":true},{"title":"  "},{"title":"B","done":true}]');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks.map(t => [t.title, t.completed])).toEqual([['A', false], ['B', true]]);
  });

  it('returns an error for malformed JSON rather than treating it as a task', () => {
    const res = parseImport('{ "tasks": [ {"title": ');
    expect(res.ok).toBe(false);
  });
});

describe('parseImport — plain text fallback', () => {
  it('treats each non-empty line as a title without splitting on commas', () => {
    const res = parseImport('Milk, 2L\n\nBread\n  Eggs  \n');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tasks.map(t => t.title)).toEqual(['Milk, 2L', 'Bread', 'Eggs']);
    expect(res.tasks.every(t => t.level === 0 && !t.completed)).toBe(true);
  });
});

describe('parseImport — errors', () => {
  it('rejects empty input', () => {
    expect(parseImport('   \n ')).toEqual({ ok: false, error: 'Nothing to import.' });
  });

  it('rejects JSON with no usable tasks', () => {
    const res = parseImport('{"name":"x","tasks":[]}');
    expect(res.ok).toBe(false);
  });

  it('rejects more than the task cap', () => {
    const lines = Array.from({ length: IMPORT_MAX_TASKS + 1 }, (_, i) => `task ${i}`).join('\n');
    const res = parseImport(lines);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(String(IMPORT_MAX_TASKS));
  });
});
