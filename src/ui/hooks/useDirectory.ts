import { useEffect } from 'react';
import { create } from 'zustand';
import type { DirectoryPerson } from '../../data/api/generated/models';
import { getUsersDirectory } from '../../data/api/generated/users/users';

// Best-effort cache of the org directory (principal id → person), fetched once. Used to render
// provenance (created/completed-by) names instead of raw principal ids. Offline or on failure,
// callers fall back to the empty resolver (assignee/member names come inline from list.members).

interface DirectoryState {
  byPrincipalId: Record<string, DirectoryPerson>;
  loaded: boolean;
  loading: boolean;
}

const useStore = create<DirectoryState>(() => ({ byPrincipalId: {}, loaded: false, loading: false }));

async function fetchOnce(): Promise<void> {
  const s = useStore.getState();
  if (s.loaded || s.loading) return;
  useStore.setState({ loading: true });
  try {
    const r = await getUsersDirectory();
    if (r.status === 200) {
      const byPrincipalId: Record<string, DirectoryPerson> = {};
      for (const p of r.data.people) byPrincipalId[p.principalId] = p;
      useStore.setState({ byPrincipalId, loaded: true, loading: false });
      return;
    }
  } catch {
    // best-effort; fall through
  }
  useStore.setState({ loading: false });
}

/** Returns a `name(principalId)` resolver: display name if known, else email, else empty. */
export function useDirectory(): (principalId: string | null | undefined) => string {
  const byPrincipalId = useStore(s => s.byPrincipalId);
  useEffect(() => {
    void fetchOnce();
  }, []);
  return (principalId): string => {
    if (!principalId) return '';
    const p = byPrincipalId[principalId];
    return p?.displayName ?? p?.email ?? '';
  };
}
