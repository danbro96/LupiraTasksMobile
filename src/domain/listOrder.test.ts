import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { planListReorder, sortActiveLists, sortArchivedLists, type OrderableList } from './listOrder';

function list(id: string, name = id, sortOrder: string | null = null, extra: Partial<OrderableList> = {}): OrderableList {
  return { id, name, sortOrder, updatedAt: '2026-01-01T00:00:00.000Z', ...extra };
}

// Valid fractional-indexing keys (the library rejects bare keys like 'a'): K[0] < K[1] < K[2] …
const K: string[] = (() => {
  const ks: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < 5; i++) {
    prev = generateKeyBetween(prev, null);
    ks.push(prev);
  }
  return ks;
})();

const ids = (lists: OrderableList[]) => lists.map(l => l.id);

describe('sortActiveLists', () => {
  it('puts dragged lists first, in key order', () => {
    const sorted = sortActiveLists([list('a', 'Apple', K[1]), list('b', 'Banana', K[0])]);
    expect(ids(sorted)).toEqual(['b', 'a']);
  });

  it('sorts never-dragged lists by name after the dragged ones', () => {
    const sorted = sortActiveLists([
      list('zebra', 'Zebra'),
      list('keyed', 'Keyed', K[0]),
      list('apple', 'Apple'),
    ]);
    expect(ids(sorted)).toEqual(['keyed', 'apple', 'zebra']);
  });

  it('compares names case-insensitively', () => {
    expect(ids(sortActiveLists([list('b', 'banana'), list('a', 'Apple')]))).toEqual(['a', 'b']);
  });

  it('breaks a duplicate key tie by name so the order is stable', () => {
    expect(ids(sortActiveLists([list('z', 'Zebra', K[0]), list('a', 'Apple', K[0])]))).toEqual(['a', 'z']);
  });

  it('leaves the input array untouched', () => {
    const input = [list('b', 'Banana'), list('a', 'Apple')];
    sortActiveLists(input);
    expect(ids(input)).toEqual(['b', 'a']);
  });
});

describe('sortArchivedLists', () => {
  it('returns the most recently archived first', () => {
    const sorted = sortArchivedLists([
      list('early', 'Early', null, { archivedAt: '2026-02-01T00:00:00.000Z' }),
      list('late', 'Late', null, { archivedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(ids(sorted)).toEqual(['late', 'early']);
  });

  it('ignores sortOrder — the drag order does not apply to the archive', () => {
    const sorted = sortArchivedLists([
      list('keyed', 'Keyed', K[0], { archivedAt: '2026-02-01T00:00:00.000Z' }),
      list('later', 'Later', null, { archivedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(ids(sorted)).toEqual(['later', 'keyed']);
  });

  it('compares instants, so a non-UTC offset still sorts correctly', () => {
    const sorted = sortArchivedLists([
      list('utc', 'Utc', null, { archivedAt: '2026-02-01T09:00:00.000Z' }),
      list('plus2', 'Plus2', null, { archivedAt: '2026-02-01T10:00:00.000+02:00' }), // 08:00Z — earlier
    ]);
    expect(ids(sorted)).toEqual(['utc', 'plus2']);
  });

  it('falls back to updatedAt for docs written before archivedAt existed', () => {
    const sorted = sortArchivedLists([
      list('old', 'Old', null, { updatedAt: '2026-01-01T00:00:00.000Z' }),
      list('new', 'New', null, { updatedAt: '2026-05-01T00:00:00.000Z' }),
    ]);
    expect(ids(sorted)).toEqual(['new', 'old']);
  });
});

describe('planListReorder', () => {
  it('materializes every list on the first drag, in the dropped order', () => {
    const lists = [list('a'), list('b'), list('c')];
    const plan = planListReorder(lists, 2, 0);

    expect(plan.map(p => p.listId)).toEqual(['c', 'a', 'b']);
    expect(plan.map(p => p.sortOrder)).toEqual([...plan.map(p => p.sortOrder)].sort());
  });

  it('materializes when only some lists are keyed', () => {
    const plan = planListReorder([list('a', 'a', K[0]), list('b'), list('c', 'c', K[1])], 0, 2);
    expect(plan.map(p => p.listId)).toEqual(['b', 'c', 'a']);
  });

  it('emits one key once every list is ordered', () => {
    const lists = [list('a', 'a', K[0]), list('b', 'b', K[1]), list('c', 'c', K[2])];
    const plan = planListReorder(lists, 0, 1);

    expect(plan).toHaveLength(1);
    expect(plan[0].listId).toBe('a');
    expect(plan[0].sortOrder > K[1] && plan[0].sortOrder < K[2]).toBe(true);
  });

  it('keys a move to the top below the previous first list', () => {
    const lists = [list('a', 'a', K[0]), list('b', 'b', K[1]), list('c', 'c', K[2])];
    const plan = planListReorder(lists, 2, 0);

    expect(plan[0]).toMatchObject({ listId: 'c' });
    expect(plan[0].sortOrder < K[0]).toBe(true);
  });

  it('keys a move to the bottom above the previous last list', () => {
    const lists = [list('a', 'a', K[0]), list('b', 'b', K[1]), list('c', 'c', K[2])];
    const plan = planListReorder(lists, 0, 2);

    expect(plan[0]).toMatchObject({ listId: 'a' });
    expect(plan[0].sortOrder > K[2]).toBe(true);
  });

  it('is a no-op when the row did not move or the index is out of range', () => {
    const lists = [list('a', 'a', K[0]), list('b', 'b', K[1])];
    expect(planListReorder(lists, 1, 1)).toEqual([]);
    expect(planListReorder(lists, 0, 9)).toEqual([]);
    expect(planListReorder(lists, -1, 0)).toEqual([]);
  });

  it('bails when the neighbors it would key between are not ordered', () => {
    const lists = [list('a', 'a', K[2]), list('b', 'b', K[0]), list('c', 'c', K[1])];
    // Dropping 'c' between the descending pair a(K2) > b(K0) leaves no key to generate.
    expect(planListReorder(lists, 2, 1)).toEqual([]);
  });
});
