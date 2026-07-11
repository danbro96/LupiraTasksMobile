import { describe, it, expect } from 'vitest';
import { applyListOp } from './listDoc';
import type { ListResponse, MemberResponse, PersonRef } from '../data/api/generated/models';
import { ListRole } from '../data/api/generated/models';
import type { ClientOp } from './ops';

const LIST = '11111111-1111-1111-1111-111111111111';
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const base = { commandId: '00000000-0000-0000-0000-000000000001', occurredAt: '2026-06-07T12:00:00.000Z' };
const ownerRef: PersonRef = { principalId: OWNER_ID, email: 'owner@x', displayName: null };

function member(principalId: string, email: string, role: ListRole = ListRole.Editor): MemberResponse {
  return { principalId, email, displayName: null, role, addedAt: '2026-01-01T00:00:00.000Z', addedBy: null };
}

function doc(members: MemberResponse[], color: string | null = null): ListResponse {
  return {
    id: LIST, version: 1, name: 'L', kind: 'Todo', color, simplePriority: true, owner: ownerRef,
    isArchived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [], members,
  } as ListResponse;
}

const owner = () => member(OWNER_ID, 'owner@x', ListRole.Owner);

describe('applyListOp', () => {
  it('renames', () => {
    const op = { ...base, kind: 'list.rename', listId: LIST, name: 'New' } as ClientOp;
    expect(applyListOp(doc([owner()]), op, ownerRef)?.name).toBe('New');
  });

  it('recolors (set and clear)', () => {
    const set = { ...base, kind: 'list.recolor', listId: LIST, color: '#fff' } as ClientOp;
    const clear = { ...base, kind: 'list.recolor', listId: LIST, color: null } as ClientOp;
    expect(applyListOp(doc([]), set, null)?.color).toBe('#fff');
    expect(applyListOp(doc([], '#fff'), clear, null)?.color).toBeNull();
  });

  it('sets simplePriority (toggle off and on)', () => {
    const off = { ...base, kind: 'list.setSimplePriority', listId: LIST, simplePriority: false } as ClientOp;
    const on = { ...base, kind: 'list.setSimplePriority', listId: LIST, simplePriority: true } as ClientOp;
    expect(applyListOp(doc([owner()]), off, null)?.simplePriority).toBe(false);
    expect(applyListOp(doc([owner()]), on, null)?.simplePriority).toBe(true);
  });

  it('adds a new member by email with the actor as addedBy (principal filled in on pull)', () => {
    const op = { ...base, kind: 'list.memberAdd', listId: LIST, email: 'bob@x', role: ListRole.Editor } as ClientOp;
    const d = applyListOp(doc([owner()]), op, ownerRef);
    const bob = d?.members.find(m => m.email === 'bob@x');
    expect(bob?.role).toBe(ListRole.Editor);
    expect(bob?.principalId).toBe(''); // placeholder until the server resolves the invite
    expect(bob?.addedBy?.principalId).toBe(OWNER_ID);
  });

  it('re-inviting an existing member (different case) updates role without duplicating', () => {
    const op = { ...base, kind: 'list.memberAdd', listId: LIST, email: 'BOB@x', role: ListRole.Editor } as ClientOp;
    const d = applyListOp(doc([owner(), member(BOB_ID, 'bob@x', ListRole.Viewer)]), op, ownerRef);
    const bobs = d!.members.filter(m => m.email.toLowerCase() === 'bob@x');
    expect(bobs).toHaveLength(1);
    expect(bobs[0].role).toBe(ListRole.Editor);
  });

  it('changes a member role by principal id', () => {
    const op = { ...base, kind: 'list.memberRoleChange', listId: LIST, principalId: BOB_ID, role: ListRole.Owner } as ClientOp;
    const d = applyListOp(doc([owner(), member(BOB_ID, 'bob@x', ListRole.Viewer)]), op, ownerRef);
    expect(d?.members.find(m => m.principalId === BOB_ID)?.role).toBe(ListRole.Owner);
  });

  it('removing a non-owner keeps the list', () => {
    const op = { ...base, kind: 'list.memberRemove', listId: LIST, principalId: BOB_ID } as ClientOp;
    const d = applyListOp(doc([owner(), member(BOB_ID, 'bob@x')]), op, ownerRef);
    expect(d).not.toBeNull();
    expect(d!.members.some(m => m.principalId === BOB_ID)).toBe(false);
  });

  it('last owner leaving deletes the list (null)', () => {
    const op = { ...base, kind: 'list.leave', listId: LIST, principalId: OWNER_ID } as ClientOp;
    expect(applyListOp(doc([owner(), member(BOB_ID, 'bob@x', ListRole.Editor)]), op, ownerRef)).toBeNull();
  });

  it('an owner leaving while another owner remains keeps the list', () => {
    const op = { ...base, kind: 'list.leave', listId: LIST, principalId: OWNER_ID } as ClientOp;
    const d = applyListOp(doc([owner(), member(BOB_ID, 'bob@x', ListRole.Owner)]), op, ownerRef);
    expect(d).not.toBeNull();
    expect(d!.members.some(m => m.principalId === OWNER_ID)).toBe(false);
  });

  it('archives and restores (toggles isArchived, keeps the list)', () => {
    const archive = { ...base, kind: 'list.archive', listId: LIST } as ClientOp;
    const restore = { ...base, kind: 'list.restore', listId: LIST } as ClientOp;
    const archived = applyListOp(doc([owner()]), archive, ownerRef);
    expect(archived?.isArchived).toBe(true);
    expect(applyListOp(archived!, restore, ownerRef)?.isArchived).toBe(false);
  });

  it('deletes the list (null) regardless of co-owners', () => {
    const op = { ...base, kind: 'list.delete', listId: LIST } as ClientOp;
    expect(applyListOp(doc([owner(), member(BOB_ID, 'bob@x', ListRole.Owner)]), op, ownerRef)).toBeNull();
  });
});
