import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import { emptyItemState, type ItemState } from './itemState';
import {
  buildVisibleRows,
  collapseDescendants,
  descendantIds,
  siblingReorder,
  childrenOf,
  nextChildSortOrder,
  type VisibleRow,
} from './itemTree';

function item(id: string, sortOrder: string, parentItemId: string | null = null, completed = false): ItemState {
  return { ...emptyItemState(), id, sortOrder, parentItemId, completed, title: id };
}

// Valid fractional-indexing keys (the library rejects bare keys like 'a'): K[0] < K[1] < K[2] …
const K: string[] = (() => {
  const ks: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < 6; i++) {
    prev = generateKeyBetween(prev, null);
    ks.push(prev);
  }
  return ks;
})();

/** Reproduce a single-item drag from index `from` to `to` over a flattened rows array. */
function applyDrag(rows: VisibleRow[], from: number, to: number): VisibleRow[] {
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

describe('buildVisibleRows', () => {
  it('lists roots at depth 0 and flags which have children', () => {
    const items = [item('A', 'a'), item('B', 'b'), item('A1', 'a0', 'A')];
    const rows = buildVisibleRows(items, new Set(), false);
    // A1 is collapsed under A, so only A and B show.
    expect(rows.map(r => r.item.id)).toEqual(['A', 'B']);
    expect(rows.find(r => r.item.id === 'A')!.hasChildren).toBe(true);
    expect(rows.find(r => r.item.id === 'B')!.hasChildren).toBe(false);
  });

  it('descends into expanded nodes, inset by depth, recursively', () => {
    const items = [item('A', 'a'), item('A1', 'a', 'A'), item('A1a', 'a', 'A1')];
    const rows = buildVisibleRows(items, new Set(['A', 'A1']), false);
    expect(rows.map(r => [r.item.id, r.depth])).toEqual([
      ['A', 0],
      ['A1', 1],
      ['A1a', 2],
    ]);
  });

  it('expanding only the parent shows children but not grandchildren', () => {
    const items = [item('A', 'a'), item('A1', 'a', 'A'), item('A1a', 'a', 'A1')];
    const rows = buildVisibleRows(items, new Set(['A']), false);
    expect(rows.map(r => r.item.id)).toEqual(['A', 'A1']);
  });

  it('hideCompleted skips completed items', () => {
    const items = [item('A', 'a'), item('B', 'b', null, true)];
    expect(buildVisibleRows(items, new Set(), true).map(r => r.item.id)).toEqual(['A']);
    expect(buildVisibleRows(items, new Set(), false).map(r => r.item.id)).toEqual(['A', 'B']);
  });

  it('treats an item with a missing parent as a root (nothing disappears)', () => {
    const rows = buildVisibleRows([item('orphan', 'a', 'gone')], new Set(), false);
    expect(rows.map(r => [r.item.id, r.depth])).toEqual([['orphan', 0]]);
  });
});

describe('collapseDescendants', () => {
  it('removes the node and all descendants from the expanded set', () => {
    const items = [item('A', 'a'), item('A1', 'a', 'A'), item('A1a', 'a', 'A1'), item('B', 'b')];
    const expanded = new Set(['A', 'A1', 'B']);
    const next = collapseDescendants(expanded, 'A', items);
    expect([...next].sort()).toEqual(['B']);
  });
});

describe('descendantIds', () => {
  it('returns the full subtree under an item', () => {
    const items = [item('A', 'a'), item('A1', 'a', 'A'), item('A1a', 'a', 'A1'), item('B', 'b')];
    expect(descendantIds(items, 'A').sort()).toEqual(['A1', 'A1a']);
    expect(descendantIds(items, 'B')).toEqual([]);
  });
});

describe('siblingReorder', () => {
  const roots = (): VisibleRow[] =>
    [item('A', K[0]), item('B', K[1]), item('C', K[2])].map(it => ({ item: it, depth: 0, hasChildren: false }));

  it('moves a key strictly between new neighbors', () => {
    const moved = applyDrag(roots(), 2, 1); // C between A and B
    const t = siblingReorder(moved, 'C')!;
    expect(t.parentItemId).toBeNull();
    expect(t.sortOrder > K[0] && t.sortOrder < K[1]).toBe(true);
  });

  it('moves to the end → key after the last sibling', () => {
    const moved = applyDrag(roots(), 0, 2); // A to the end
    const t = siblingReorder(moved, 'A')!;
    expect(t.sortOrder > K[2]).toBe(true);
  });

  it('moves to the start → key before the first sibling', () => {
    const moved = applyDrag(roots(), 2, 0); // C to the start
    const t = siblingReorder(moved, 'C')!;
    expect(t.sortOrder < K[0]).toBe(true);
  });

  it('reorders only among same-parent siblings (ignores other groups)', () => {
    // P with two children; dragging the second child above the first. Children interleaved with P.
    const rows: VisibleRow[] = [
      { item: item('P', K[0]), depth: 0, hasChildren: true },
      { item: item('A2', K[1], 'P'), depth: 1, hasChildren: false },
      { item: item('A', K[0], 'P'), depth: 1, hasChildren: false },
    ];
    const t = siblingReorder(rows, 'A2')!;
    expect(t.parentItemId).toBe('P');
    expect(t.sortOrder < K[0]).toBe(true); // A2 now first among P's children
  });
});

describe('child ordering helpers', () => {
  it('childrenOf returns sorted direct children', () => {
    const items = [item('A1', K[1], 'A'), item('A2', K[0], 'A'), item('B', K[0])];
    expect(childrenOf(items, 'A').map(i => i.id)).toEqual(['A2', 'A1']);
  });

  it('nextChildSortOrder is greater than the last existing child', () => {
    const items = [item('A1', K[0], 'A')];
    expect(nextChildSortOrder(items, 'A') > K[0]).toBe(true);
    expect(typeof nextChildSortOrder(items, 'empty')).toBe('string');
  });
});
