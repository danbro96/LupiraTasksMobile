import { describe, it, expect } from 'vitest';
import { emptyItemState, type ItemState } from './itemState';
import { changeLabel, diffItems } from './itemChange';

function item(id: string, over: Partial<ItemState> = {}): ItemState {
  return { ...emptyItemState(), id, title: id, sortOrder: id, ...over };
}

const prevOf = (items: ItemState[]) => new Map(items.map(i => [i.id, i]));

describe('diffItems', () => {
  it('reports nothing on a first load (no previous read to compare against)', () => {
    expect(diffItems(new Map(), [item('A'), item('B')])).toEqual([]);
  });

  it('reports a completion with the principal who did it', () => {
    const before = [item('A')];
    const after = [item('A', { completed: true, completedBy: 'anna-p' })];

    expect(diffItems(prevOf(before), after)).toEqual([
      { itemId: 'A', kind: 'completed', actor: 'anna-p' },
    ]);
  });

  it('attributes a reopen to whoever had completed it (the new state has cleared it)', () => {
    const before = [item('A', { completed: true, completedBy: 'anna-p' })];
    const after = [item('A', { completed: false, completedBy: null })];

    expect(diffItems(prevOf(before), after)).toEqual([
      { itemId: 'A', kind: 'reopened', actor: 'anna-p' },
    ]);
  });

  it('classifies a rename, an added item and any other visible edit', () => {
    const before = [item('A'), item('B')];
    const after = [item('A', { title: 'New name' }), item('B', { priority: 5 }), item('C', { createdBy: 'anna-p' })];

    expect(diffItems(prevOf(before), after)).toEqual([
      { itemId: 'A', kind: 'renamed', actor: null },
      { itemId: 'B', kind: 'updated', actor: null },
      { itemId: 'C', kind: 'added', actor: 'anna-p' },
    ]);
  });

  it('ignores changes the row does not render (LWW guards, updatedAt, sortOrder)', () => {
    const before = [item('A')];
    const after = [item('A', { updatedAt: '2026-07-29T00:00:00.000Z', nameCmd: 'c1', completedTs: '2026-07-29T00:00:00.000Z', sortOrder: 'zz' })];

    expect(diffItems(prevOf(before), after)).toEqual([]);
  });

  it('reports each changed item once, and skips the unchanged ones', () => {
    const before = [item('A'), item('B'), item('C')];
    const after = [item('A'), item('B', { completed: true }), item('C', { dueAt: '2026-08-01T00:00:00.000Z' })];

    expect(diffItems(prevOf(before), after).map(c => c.itemId)).toEqual(['B', 'C']);
  });
});

describe('changeLabel', () => {
  it('names the actor when one was resolved', () => {
    expect(changeLabel('completed', 'Anna')).toBe('Anna completed');
  });

  it('keeps only the first name, and the local part of an email fallback', () => {
    expect(changeLabel('completed', 'Anna Svensson')).toBe('Anna completed');
    expect(changeLabel('renamed', 'anna@example.com')).toBe('anna renamed');
  });

  it('treats a blank display name as unknown', () => {
    expect(changeLabel('added', '  ')).toBe('Added elsewhere');
  });

  it('says the change came from elsewhere when the actor is unknown', () => {
    expect(changeLabel('renamed', null)).toBe('Renamed elsewhere');
    expect(changeLabel('updated', null)).toBe('Changed elsewhere');
  });
});
