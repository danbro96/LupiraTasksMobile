import { ListRole } from '../api/generated/models';
import { useAuth } from '../store/auth-store';
import { useLists } from './useMirror';

const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The current user's role on a list, or undefined if not a member / list not in the mirror. */
export function useMyRole(listId: string): ListRole | undefined {
  const { lists } = useLists();
  const me = useAuth(s => s.user?.sub) ?? '';
  const list = lists.find(l => l.id === listId);
  return list?.members.find(m => sameEmail(m.email, me))?.role;
}

/** Whether a role may modify list contents (add/edit/complete/delete items). Viewers cannot. */
export function canEditWithRole(role: ListRole | undefined): boolean {
  return role === ListRole.Owner || role === ListRole.Editor;
}
