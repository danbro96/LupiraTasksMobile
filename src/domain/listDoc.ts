import type { ListResponse, MemberResponse } from '../data/api/generated/models';
import type { ClientOp } from './ops';

// Pure optimistic patch of a mirrored list doc for `list.*` ops — the list equivalent of the
// item LWW reducer. Returns the patched ListResponse, or `null` when the change deletes the list
// locally (the last owner leaving / being removed), mirroring the server's auto-delete cascade.
// Framework-free so it can be unit-tested (see listDoc.test.ts).

function sameEmail(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function upsertMember(
  members: readonly MemberResponse[],
  email: string,
  role: MemberResponse['role'],
  at: string,
  actor: string | null,
): MemberResponse[] {
  if (members.some(m => sameEmail(m.email, email))) {
    return members.map(m => (sameEmail(m.email, email) ? { ...m, role } : m));
  }
  return [...members, { email, role, addedAt: at, addedBy: actor }];
}

export function applyListOp(doc: ListResponse, op: ClientOp, actorEmail: string | null): ListResponse | null {
  switch (op.kind) {
    case 'list.rename':
      return { ...doc, name: op.name, updatedAt: op.occurredAt };

    case 'list.recolor':
      return { ...doc, color: op.color, updatedAt: op.occurredAt };

    case 'list.setSimplePriority':
      return { ...doc, simplePriority: op.simplePriority, updatedAt: op.occurredAt };

    case 'list.memberAdd':
      return { ...doc, members: upsertMember(doc.members, op.email, op.role, op.occurredAt, actorEmail), updatedAt: op.occurredAt };

    case 'list.memberRoleChange':
      return {
        ...doc,
        members: doc.members.map(m => (sameEmail(m.email, op.email) ? { ...m, role: op.role } : m)),
        updatedAt: op.occurredAt,
      };

    case 'list.memberRemove':
    case 'list.leave': {
      const target = doc.members.find(m => sameEmail(m.email, op.email));
      const remaining = doc.members.filter(m => !sameEmail(m.email, op.email));
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
