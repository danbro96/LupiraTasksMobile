import { useEffect } from 'react';
import { create } from 'zustand';
import { getUsersDirectory } from '../api/generated/users/users';

// Best-effort cache of the org directory (email → display name), fetched once. Used to render
// member/assignee names instead of raw emails. Offline or on failure, callers fall back to email.

interface DirectoryState {
  byEmail: Record<string, string>;
  loaded: boolean;
  loading: boolean;
}

const useStore = create<DirectoryState>(() => ({ byEmail: {}, loaded: false, loading: false }));

async function fetchOnce(): Promise<void> {
  const s = useStore.getState();
  if (s.loaded || s.loading) return;
  useStore.setState({ loading: true });
  try {
    const r = await getUsersDirectory();
    if (r.status === 200) {
      const byEmail: Record<string, string> = {};
      for (const p of r.data.people) {
        if (p.displayName) byEmail[p.email.toLowerCase()] = p.displayName;
      }
      useStore.setState({ byEmail, loaded: true, loading: false });
      return;
    }
  } catch {
    // best-effort; fall through
  }
  useStore.setState({ loading: false });
}

/** Returns a `name(email)` resolver: display name if known, otherwise the email itself. */
export function useDirectory(): (email: string | null | undefined) => string {
  const byEmail = useStore(s => s.byEmail);
  useEffect(() => {
    void fetchOnce();
  }, []);
  return (email): string => {
    if (!email) return '';
    return byEmail[email.toLowerCase()] ?? email;
  };
}
