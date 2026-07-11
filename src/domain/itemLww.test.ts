import { describe, it, expect } from 'vitest';
import type { Guid, Iso, ItemEvent } from './events';
import { reduceItemEvents } from './itemLww';

// Shared LWW convergence contract — the client mirror of the server's ItemLwwTests.
// Each concurrency vector is applied in BOTH orders and must converge identically.

const LIST = '11111111-1111-1111-1111-111111111111';
const ITEM = '22222222-2222-2222-2222-222222222222';
const TAG = '33333333-3333-3333-3333-333333333333';
const ALICE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // actor principal id
const BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // assignee principal id

const at = (sec: number): Iso => new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString();
const cmd = (suffix: string): Guid => `00000000-0000-0000-0000-0000000000${suffix}`;
const CMD_LO = cmd('c1');
const CMD_HI = cmd('c2'); // ordinal-greater than CMD_LO, so it wins an OccurredAt tie

const added = (occurredAt: Iso = at(0), commandId: Guid = cmd('00')): ItemEvent => ({
  type: 'ItemAdded', itemId: ITEM, listId: LIST, parentItemId: null, title: 'Milk', sortOrder: 'a', occurredAt, commandId,
});
const reduce = (events: ItemEvent[]) => reduceItemEvents(events, ALICE);

describe('item LWW reducer', () => {
  it('replays a stream into the snapshot with actor attribution', () => {
    const s = reduce([
      added(),
      { type: 'ItemRenamed', itemId: ITEM, title: 'Oat milk', occurredAt: at(1), commandId: cmd('01') },
      { type: 'ItemCompleted', itemId: ITEM, occurredAt: at(2), commandId: cmd('02') },
    ]);
    expect(s.title).toBe('Oat milk');
    expect(s.completed).toBe(true);
    expect(s.createdBy).toBe(ALICE);
    expect(s.completedBy).toBe(ALICE);
  });

  it('ignores an older occurredAt (no clobber)', () => {
    const s = reduce([
      added(),
      { type: 'ItemRenamed', itemId: ITEM, title: 'New', occurredAt: at(20), commandId: cmd('20') },
      { type: 'ItemRenamed', itemId: ITEM, title: 'Stale', occurredAt: at(10), commandId: cmd('10') },
    ]);
    expect(s.title).toBe('New');
  });

  it('merges edits to different fields regardless of relative age', () => {
    const s = reduce([
      added(),
      { type: 'ItemRenamed', itemId: ITEM, title: 'Eggs', occurredAt: at(20), commandId: cmd('20') },
      { type: 'ItemAssigned', itemId: ITEM, assigneePrincipalId: BOB, occurredAt: at(10), commandId: cmd('10') },
    ]);
    expect(s.title).toBe('Eggs');
    expect(s.assignedTo).toBe(BOB);
  });

  it('treats an equal (occurredAt, commandId) replay as a no-op', () => {
    const e: ItemEvent = { type: 'ItemRenamed', itemId: ITEM, title: 'Once', occurredAt: at(10), commandId: cmd('aa') };
    const after: ItemEvent = { type: 'ItemRenamed', itemId: ITEM, title: 'Later', occurredAt: at(5), commandId: cmd('05') };
    const s = reduce([added(), e, e, after]);
    expect(s.title).toBe('Once');
  });

  it('lets the tombstone win over a newer concurrent edit, both orders', () => {
    const del: ItemEvent = { type: 'ItemDeleted', itemId: ITEM, occurredAt: at(5), commandId: cmd('05') };
    const ren: ItemEvent = { type: 'ItemRenamed', itemId: ITEM, title: 'After', occurredAt: at(99), commandId: cmd('99') };
    const a = reduce([added(), ren, del]);
    const b = reduce([added(), del, ren]);
    expect(a.deleted).toBe(true);
    expect(b.deleted).toBe(true);
  });

  it('converges two same-field renames at equal occurredAt (commandId tiebreak), both orders', () => {
    const e1: ItemEvent = { type: 'ItemRenamed', itemId: ITEM, title: 'Apples', occurredAt: at(10), commandId: CMD_LO };
    const e2: ItemEvent = { type: 'ItemRenamed', itemId: ITEM, title: 'Bananas', occurredAt: at(10), commandId: CMD_HI };
    expect(reduce([added(), e1, e2]).title).toBe('Bananas');
    expect(reduce([added(), e2, e1]).title).toBe('Bananas');
  });

  it('converges complete-vs-reopen at equal occurredAt, both orders', () => {
    const comp: ItemEvent = { type: 'ItemCompleted', itemId: ITEM, occurredAt: at(10), commandId: CMD_HI };
    const reop: ItemEvent = { type: 'ItemReopened', itemId: ITEM, occurredAt: at(10), commandId: CMD_LO };
    expect(reduce([added(), comp, reop]).completed).toBe(true); // higher commandId (complete) wins
    expect(reduce([added(), reop, comp]).completed).toBe(true);
  });

  it('converges tag add-vs-remove at equal occurredAt, both orders', () => {
    const add: ItemEvent = { type: 'ItemTagAdded', itemId: ITEM, tagId: TAG, occurredAt: at(10), commandId: CMD_LO };
    const rem: ItemEvent = { type: 'ItemTagRemoved', itemId: ITEM, tagId: TAG, occurredAt: at(10), commandId: CMD_HI };
    expect(reduce([added(), add, rem]).tags).not.toContain(TAG); // higher commandId (remove) wins
    expect(reduce([added(), rem, add]).tags).not.toContain(TAG);
  });

  it('applies priority and ignores an older priority update', () => {
    const s = reduce([
      added(),
      { type: 'ItemPrioritySet', itemId: ITEM, priority: 5, occurredAt: at(20), commandId: cmd('20') },
      { type: 'ItemPrioritySet', itemId: ITEM, priority: 9, occurredAt: at(10), commandId: cmd('10') },
    ]);
    expect(s.priority).toBe(5);
  });

  it('converges two priority sets at equal occurredAt (commandId tiebreak), both orders', () => {
    const e1: ItemEvent = { type: 'ItemPrioritySet', itemId: ITEM, priority: 3, occurredAt: at(10), commandId: CMD_LO };
    const e2: ItemEvent = { type: 'ItemPrioritySet', itemId: ITEM, priority: 7, occurredAt: at(10), commandId: CMD_HI };
    expect(reduce([added(), e1, e2]).priority).toBe(7);
    expect(reduce([added(), e2, e1]).priority).toBe(7);
  });

  it('merges independent tag adds commutatively', () => {
    const t2 = '44444444-4444-4444-4444-444444444444';
    const a = reduce([
      added(),
      { type: 'ItemTagAdded', itemId: ITEM, tagId: TAG, occurredAt: at(10), commandId: cmd('10') },
      { type: 'ItemTagAdded', itemId: ITEM, tagId: t2, occurredAt: at(11), commandId: cmd('11') },
    ]);
    expect(a.tags).toContain(TAG);
    expect(a.tags).toContain(t2);
  });
});
