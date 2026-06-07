import { describe, it, expect } from 'vitest';
import { applyListOp } from './listDoc';
import type { ListResponse, MemberResponse } from '../api/generated/models';
import { ListRole } from '../api/generated/models';
import type { ClientOp } from './ops';

const LIST = '11111111-1111-1111-1111-111111111111';
const base = { commandId: '00000000-0000-0000-0000-000000000001', occurredAt: '2026-06-07T12:00:00.000Z' };

function member(email: string, role: ListRole = ListRole.Editor): MemberResponse {
  return { email, role, addedAt: '2026-01-01T00:00:00.000Z', addedBy: null };
}

function doc(members: MemberResponse[], color: string | null = null): ListResponse {
  return {
    id: LIST, version: 1, name: 'L', kind: 'Todo', color, ownerEmail: 'owner@x',
    isArchived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [], members,
  } as ListResponse;
}

const owner = () => member('owner@x', ListRole.Owner);

describe('applyListOp', () => {
  it('renames', () => {
    const op = { ...base, kind: 'list.rename', listId: LIST, name: 'New' } as ClientOp;
    expect(applyListOp(doc([owner()]), op, 'owner@x')?.name).toBe('New');
  });

  it('recolors (set and clear)', () => {
    const set = { ...base, kind: 'list.recolor', listId: LIST, color: '#fff' } as ClientOp;
    const clear = { ...base, kind: 'list.recolor', listId: LIST, color: null } as ClientOp;
    expect(applyListOp(doc([]), set, null)?.color).toBe('#fff');
    expect(applyListOp(doc([], '#fff'), clear, null)?.color).toBeNull();
  });

  it('adds a new member with the actor as addedBy', () => {
    const op = { ...base, kind: 'list.memberAdd', listId: LIST, email: 'bob@x', role: ListRole.Editor } as ClientOp;
    const d = applyListOp(doc([owner()]), op, 'owner@x');
    const bob = d?.members.find(m => m.email === 'bob@x');
    expect(bob?.role).toBe(ListRole.Editor);
    expect(bob?.addedBy).toBe('owner@x');
  });

  it('re-adding an existing member (different case) updates role without duplicating', () => {
    const op = { ...base, kind: 'list.memberAdd', listId: LIST, email: 'BOB@x', role: ListRole.Editor } as ClientOp;
    const d = applyListOp(doc([owner(), member('bob@x', ListRole.Viewer)]), op, 'owner@x');
    const bobs = d!.members.filter(m => m.email.toLowerCase() === 'bob@x');
    expect(bobs).toHaveLength(1);
    expect(bobs[0].role).toBe(ListRole.Editor);
  });

  it('changes a member role', () => {
    const op = { ...base, kind: 'list.memberRoleChange', listId: LIST, email: 'bob@x', role: ListRole.Owner } as ClientOp;
    const d = applyListOp(doc([owner(), member('bob@x', ListRole.Viewer)]), op, 'owner@x');
    expect(d?.members.find(m => m.email === 'bob@x')?.role).toBe(ListRole.Owner);
  });

  it('removing a non-owner keeps the list', () => {
    const op = { ...base, kind: 'list.memberRemove', listId: LIST, email: 'bob@x' } as ClientOp;
    const d = applyListOp(doc([owner(), member('bob@x')]), op, 'owner@x');
    expect(d).not.toBeNull();
    expect(d!.members.some(m => m.email === 'bob@x')).toBe(false);
  });

  it('last owner leaving deletes the list (null)', () => {
    const op = { ...base, kind: 'list.leave', listId: LIST, email: 'owner@x' } as ClientOp;
    expect(applyListOp(doc([owner(), member('bob@x', ListRole.Editor)]), op, 'owner@x')).toBeNull();
  });

  it('an owner leaving while another owner remains keeps the list', () => {
    const op = { ...base, kind: 'list.leave', listId: LIST, email: 'owner@x' } as ClientOp;
    const d = applyListOp(doc([owner(), member('bob@x', ListRole.Owner)]), op, 'owner@x');
    expect(d).not.toBeNull();
    expect(d!.members.some(m => m.email === 'owner@x')).toBe(false);
  });

  it('archives and restores (toggles isArchived, keeps the list)', () => {
    const archive = { ...base, kind: 'list.archive', listId: LIST } as ClientOp;
    const restore = { ...base, kind: 'list.restore', listId: LIST } as ClientOp;
    const archived = applyListOp(doc([owner()]), archive, 'owner@x');
    expect(archived?.isArchived).toBe(true);
    expect(applyListOp(archived!, restore, 'owner@x')?.isArchived).toBe(false);
  });

  it('deletes the list (null) regardless of co-owners', () => {
    const op = { ...base, kind: 'list.delete', listId: LIST } as ClientOp;
    expect(applyListOp(doc([owner(), member('bob@x', ListRole.Owner)]), op, 'owner@x')).toBeNull();
  });
});
