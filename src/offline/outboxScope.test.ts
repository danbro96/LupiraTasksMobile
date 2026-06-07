import { describe, it, expect } from 'vitest';
import { rowListId, rowsForList, listIdsOf } from './outboxScope';

// Minimal rows: only op_json matters to these helpers.
const row = (listId: string, extra: Record<string, unknown> = {}) => ({
  op_json: JSON.stringify({ kind: 'item.rename', listId, itemId: 'i', title: 't', commandId: 'c', occurredAt: '2026-01-01T00:00:00Z', ...extra }),
});

describe('outboxScope', () => {
  it('rowListId reads the listId out of a serialized op', () => {
    expect(rowListId(row('A').op_json)).toBe('A');
  });

  it('rowsForList keeps only rows targeting the given list', () => {
    const rows = [row('A'), row('B'), row('A'), row('C')];
    expect(rowsForList(rows, 'A')).toHaveLength(2);
    expect(rowsForList(rows, 'B')).toHaveLength(1);
    expect(rowsForList(rows, 'Z')).toHaveLength(0);
  });

  it('rowsForList preserves the original row objects and order', () => {
    const a1 = row('A'), b = row('B'), a2 = row('A');
    expect(rowsForList([a1, b, a2], 'A')).toEqual([a1, a2]);
  });

  it('listIdsOf collects the distinct lists referenced', () => {
    expect(listIdsOf([row('A'), row('B'), row('A')])).toEqual(new Set(['A', 'B']));
    expect(listIdsOf([])).toEqual(new Set());
  });
});
