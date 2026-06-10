import { describe, it, expect } from 'vitest';
import { emptyItemState, type ItemState } from './itemState';
import { tasksToCsv } from './exportTasks';

function item(partial: Partial<ItemState>): ItemState {
  return { ...emptyItemState(), ...partial };
}

const HEADER = 'level,title,completed,notes,due,assignedTo,quantity,unit,tags,completedAt,createdAt';

describe('tasksToCsv', () => {
  it('emits only the header for an empty list', () => {
    expect(tasksToCsv([], new Map())).toBe(HEADER);
  });

  it('renders booleans, nulls, and resolved tag labels', () => {
    const tagLabels = new Map([
      ['t1', 'Urgent'],
      ['t2', 'Home'],
    ]);
    const csv = tasksToCsv(
      [
        item({
          id: 'a',
          title: 'Buy milk',
          completed: true,
          quantity: 2,
          unit: 'L',
          tags: ['t1', 't2'],
          createdAt: '2026-06-10T00:00:00.000Z',
        }),
      ],
      tagLabels,
    );
    const [header, row] = csv.split('\n');
    expect(header).toBe(HEADER);
    // completed -> true, null notes/due/assignedTo/completedAt -> empty, tags joined with "; ".
    expect(row).toBe('0,Buy milk,true,,,,2,L,Urgent; Home,,2026-06-10T00:00:00.000Z');
  });

  it('falls back to the raw tag id when no label is known', () => {
    const csv = tasksToCsv([item({ id: 'a', title: 'x', tags: ['t1', 'missing'] })], new Map([['t1', 'Urgent']]));
    expect(csv.split('\n')[1]).toContain('Urgent; missing');
  });

  it('escapes commas, quotes, and newlines within a field', () => {
    const csv = tasksToCsv([item({ id: 'a', title: 'a, "b"\nc', createdAt: '' })], new Map());
    // The whole field is quoted, embedded quotes doubled, and the newline stays inside it.
    expect(csv).toContain('"a, ""b""\nc"');
  });

  it('orders subtasks under their parent with an incremented level', () => {
    const items = [
      item({ id: 'P', title: 'Parent', sortOrder: 'a' }),
      item({ id: 'C', title: 'Child', parentItemId: 'P', sortOrder: 'a' }),
      item({ id: 'Q', title: 'Sibling', sortOrder: 'b' }),
    ];
    const rows = tasksToCsv(items, new Map())
      .split('\n')
      .slice(1)
      .map(l => l.split(',').slice(0, 2));
    expect(rows).toEqual([
      ['0', 'Parent'],
      ['1', 'Child'],
      ['0', 'Sibling'],
    ]);
  });
});
