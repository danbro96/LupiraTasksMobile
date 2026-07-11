import { describe, it, expect } from 'vitest';
import type { ItemResponse } from '../data/api/generated/models';
import { ItemStatus } from '../data/api/generated/models';
import { itemResponseToState, num } from './itemMap';
import { ZERO_GUID } from './itemState';

const TS = '2026-06-01T10:00:00.000Z';

function makeResponse(over: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: 'item-1', version: 1, listId: 'list-1',
    title: 'Buy milk', status: ItemStatus.Open, completed: false, priority: 0,
    tags: [], sortOrder: 'a0',
    createdAt: '2026-05-01T00:00:00.000Z', updatedAt: TS,
    ...over,
  };
}

describe('num', () => {
  it('coerces strings, passes numbers, maps null/undefined to null', () => {
    expect(num('3.5')).toBe(3.5);
    expect(num(2)).toBe(2);
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
  });
});

describe('itemResponseToState', () => {
  it('copies core fields and marks the item not-deleted', () => {
    const s = itemResponseToState(makeResponse({ title: 'Eggs', completed: true, sortOrder: 'b2' }));
    expect(s.id).toBe('item-1');
    expect(s.listId).toBe('list-1');
    expect(s.title).toBe('Eggs');
    expect(s.completed).toBe(true);
    expect(s.sortOrder).toBe('b2');
    expect(s.deleted).toBe(false);
  });

  it('seeds every per-field guard at updatedAt with the zero command id', () => {
    const s = itemResponseToState(makeResponse());
    for (const ts of [s.nameTs, s.notesTs, s.assigneeTs, s.dueTs, s.qtyTs, s.priorityTs, s.completedTs, s.moveTs]) {
      expect(ts).toBe(TS);
    }
    for (const cmd of [s.nameCmd, s.notesCmd, s.assigneeCmd, s.dueCmd, s.qtyCmd, s.priorityCmd, s.completedCmd, s.moveCmd]) {
      expect(cmd).toBe(ZERO_GUID);
    }
  });

  it('maps absent optional fields to null', () => {
    const s = itemResponseToState(makeResponse());
    expect(s.parentItemId).toBeNull();
    expect(s.notes).toBeNull();
    expect(s.completedAt).toBeNull();
    expect(s.completedBy).toBeNull();
    expect(s.assignedTo).toBeNull();
    expect(s.dueAt).toBeNull();
    expect(s.quantity).toBeNull();
    expect(s.unit).toBeNull();
    expect(s.createdBy).toBeNull();
  });

  it('extracts the principal id from each identity PersonRef', () => {
    const s = itemResponseToState(makeResponse({
      assignee: { principalId: 'p-assignee', email: 'a@x', displayName: 'Ann' },
      createdBy: { principalId: 'p-creator', email: 'c@x', displayName: null },
      completed: true,
      completedBy: { principalId: 'p-completer', email: 'd@x' },
    }));
    expect(s.assignedTo).toBe('p-assignee');
    expect(s.createdBy).toBe('p-creator');
    expect(s.completedBy).toBe('p-completer');
  });

  it('coerces a string quantity to a number', () => {
    expect(itemResponseToState(makeResponse({ quantity: '2' })).quantity).toBe(2);
    expect(itemResponseToState(makeResponse({ quantity: 5 })).quantity).toBe(5);
  });

  it('maps priority (default 0, coercing strings)', () => {
    expect(itemResponseToState(makeResponse()).priority).toBe(0);
    expect(itemResponseToState(makeResponse({ priority: 4 })).priority).toBe(4);
    expect(itemResponseToState(makeResponse({ priority: '6' })).priority).toBe(6);
  });

  it('copies tags into a fresh array and seeds a per-tag guard for each', () => {
    const r = makeResponse({ tags: ['t1', 't2'] });
    const s = itemResponseToState(r);
    expect(s.tags).toEqual(['t1', 't2']);
    expect(s.tags).not.toBe(r.tags); // defensive copy, not a shared reference
    expect(s.tagTs).toEqual({ t1: TS, t2: TS });
    expect(s.tagCmd).toEqual({ t1: ZERO_GUID, t2: ZERO_GUID });
  });
});
