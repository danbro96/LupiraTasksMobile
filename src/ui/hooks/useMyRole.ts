import { ListRole } from '../../data/api/generated/models';
import { useAuth } from '../../state/auth-store';
import { useLists } from './useMirror';

/** The current user's role on a list, or undefined if not a member / list not in the mirror. */
export function useMyRole(listId: string): ListRole | undefined {
  const { lists } = useLists();
  const me = useAuth(s => s.user?.principalId);
  const list = lists.find(l => l.id === listId);
  if (!list || !me) return undefined;
  // Server-authoritative role (`list.access`), gated on membership so an optimistic self-leave —
  // the mirror lingers minus-me until the next pull — correctly drops edit rights.
  return list.members.some(m => m.principalId === me) ? list.access : undefined;
}

/** Whether a role may modify list contents (add/edit/complete/delete items). Viewers cannot. */
export function canEditWithRole(role: ListRole | undefined): boolean {
  return role === ListRole.Owner || role === ListRole.Editor;
}
