import type { ListDto, MemberDto, PersonRef } from '../data/api/generated/models';
import type { ClientOp } from './ops';

// Pure optimistic patch of a mirrored list doc for `list.*` ops — the list equivalent of the
// item LWW reducer. Returns the patched ListDto, or `null` when the change deletes the list
// locally (the last owner leaving / being removed), mirroring the server's auto-delete cascade.
// Framework-free so it can be unit-tested (see listDoc.test.ts).
//
// Members are keyed by principalId — EXCEPT an invite (memberAdd), where the invitee's principal
// is unknown locally: it upserts a placeholder keyed by email that the next pull replaces with the
// server's authoritative member (with principalId + displayName).

function sameEmail(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function upsertInvite(
  members: readonly MemberDto[],
  email: string,
  role: MemberDto['role'],
  at: string,
  actor: PersonRef | null,
): MemberDto[] {
  if (members.some(m => sameEmail(m.email, email))) {
    return members.map(m => (sameEmail(m.email, email) ? { ...m, role } : m));
  }
  return [...members, { principalId: '', email, displayName: null, role, addedAt: at, addedBy: actor }];
}

export function applyListOp(doc: ListDto, op: ClientOp, actor: PersonRef | null): ListDto | null {
  switch (op.kind) {
    case 'list.rename':
      return { ...doc, name: op.name, updatedAt: op.occurredAt };

    case 'list.recolor':
      return { ...doc, color: op.color, updatedAt: op.occurredAt };

    case 'list.setSimplePriority':
      return { ...doc, simplePriority: op.simplePriority, updatedAt: op.occurredAt };

    // No `updatedAt` bump, matching the server: the caller's screen position is not a change to
    // the list, and bumping it would announce a remote edit to every other member.
    case 'list.reorder':
      return { ...doc, sortOrder: op.sortOrder };

    case 'list.memberAdd':
      return { ...doc, members: upsertInvite(doc.members, op.email, op.role, op.occurredAt, actor), updatedAt: op.occurredAt };

    case 'list.memberRoleChange':
      return {
        ...doc,
        members: doc.members.map(m => (m.principalId === op.principalId ? { ...m, role: op.role } : m)),
        // Keep the caller's own access coherent (owner demoting themselves) so owner-only UI reacts
        // before the next pull; changing another member's role leaves the caller's access untouched.
        access: op.principalId === actor?.principalId ? op.role : doc.access,
        updatedAt: op.occurredAt,
      };

    case 'list.memberRemove':
    case 'list.leave': {
      const target = doc.members.find(m => m.principalId === op.principalId);
      const remaining = doc.members.filter(m => m.principalId !== op.principalId);
      // Last owner leaving/removed → the list is gone for everyone (mirror the server cascade).
      if (target?.role === 'Owner' && !remaining.some(m => m.role === 'Owner')) {
        return null;
      }
      return { ...doc, members: remaining, updatedAt: op.occurredAt };
    }

    case 'list.archive':
      return { ...doc, isArchived: true, updatedAt: op.occurredAt };

    case 'list.restore':
      return { ...doc, isArchived: false, updatedAt: op.occurredAt };

    case 'list.delete':
      return null; // owner-initiated delete removes the list locally (and for everyone on replay)

    default:
      return doc; // item ops + list.create don't patch an existing list doc here
  }
}

/**
 * Fold pending ops over a pulled doc (the rebase of `list.*` ops onto a server base). Returns
 * null when any op deletes the list locally — the pull must not resurrect it.
 */
export function applyListOps(doc: ListDto, ops: ClientOp[], actor: PersonRef | null): ListDto | null {
  let cur = doc;
  for (const op of ops) {
    const next = applyListOp(cur, op, actor);
    if (next === null) return null;
    cur = next;
  }
  return cur;
}
