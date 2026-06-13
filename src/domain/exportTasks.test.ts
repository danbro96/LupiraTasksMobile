import { describe, it, expect } from 'vitest';
import { emptyItemState, type ItemState } from './itemState';
import { tasksToJson } from './exportTasks';

function item(partial: Partial<ItemState>): ItemState {
  return { ...emptyItemState(), ...partial };
}

const parse = (items: ItemState[], tagLabels = new Map<string, string>()) =>
  JSON.parse(tasksToJson({ name: 'Groceries', kind: 'Shopping' }, items, tagLabels));

describe('tasksToJson', () => {
  it('emits the list header and an empty tasks array for an empty list', () => {
    expect(parse([])).toEqual({ version: 1, name: 'Groceries', kind: 'Shopping', tasks: [] });
  });

  it('omits empty fields and only sets done when completed', () => {
    const doc = parse([
      item({ id: 'a', title: 'Milk', quantity: 2, unit: 'L' }),
      item({ id: 'b', title: 'Done thing', completed: true, sortOrder: 'b' }),
    ]);
    expect(doc.tasks[0]).toEqual({ title: 'Milk', quantity: 2, unit: 'L' });
    expect(doc.tasks[1]).toEqual({ title: 'Done thing', done: true });
  });

  it('includes notes, due, and resolved tag labels', () => {
    const doc = parse(
      [item({ id: 'a', title: 'Call plumber', notes: 'before noon', dueAt: '2026-06-20T09:00:00.000Z', assignedTo: 'dad@x.com', tags: ['t1', 'missing'] })],
      new Map([['t1', 'Urgent']]),
    );
    expect(doc.tasks[0]).toEqual({
      title: 'Call plumber',
      notes: 'before noon',
      due: '2026-06-20T09:00:00.000Z',
      assignee: 'dad@x.com',
      tags: ['Urgent', 'missing'],
    });
  });

  it('nests subtasks under their parent in sort order', () => {
    const doc = parse([
      item({ id: 'P', title: 'Parent', sortOrder: 'a' }),
      item({ id: 'C2', title: 'Child 2', parentItemId: 'P', sortOrder: 'b' }),
      item({ id: 'C1', title: 'Child 1', parentItemId: 'P', sortOrder: 'a' }),
      item({ id: 'Q', title: 'Sibling', sortOrder: 'b' }),
    ]);
    expect(doc.tasks.map((t: { title: string }) => t.title)).toEqual(['Parent', 'Sibling']);
    expect(doc.tasks[0].subtasks.map((t: { title: string }) => t.title)).toEqual(['Child 1', 'Child 2']);
  });

  it('treats an item with a missing parent as a root', () => {
    const doc = parse([item({ id: 'orphan', title: 'Orphan', parentItemId: 'gone' })]);
    expect(doc.tasks.map((t: { title: string }) => t.title)).toEqual(['Orphan']);
  });
});
