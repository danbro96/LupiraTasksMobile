import { useEffect, useState } from 'react';
import type { ListResponse } from '../../data/api/generated/models';
import type { ItemState } from '../../domain/itemState';
import { getDb, getItemsByList, getListDocs, getArchivedListDocs } from '../../data/db';
import { useSyncStatus } from '../../sync/syncStatus';
import { logDebug } from '../../debug/log';

// Read hooks over the offline SQLite mirror. They reload whenever `mirrorRevision` bumps
// (after any enqueue or pull). Each effect drops its result if a newer bump superseded it —
// two overlapping reloads resolving out of order must not leave stale data on screen.

export function useLists(): { lists: ListResponse[] } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [lists, setLists] = useState<ListResponse[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const docs = await getListDocs<ListResponse>(db);
      logDebug('useLists', `count=${docs.length}`); // diagnostic: is the optimistic list in the mirror?
      if (!cancelled) setLists(docs);
    })();
    return () => { cancelled = true; };
  }, [rev]);
  return { lists };
}

export function useArchivedLists(): { lists: ListResponse[] } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [lists, setLists] = useState<ListResponse[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const docs = await getArchivedListDocs<ListResponse>(db);
      if (!cancelled) setLists(docs);
    })();
    return () => { cancelled = true; };
  }, [rev]);
  return { lists };
}

export function useItems(listId: string): { items: ItemState[]; loading: boolean } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [items, setItems] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await getItemsByList(db, listId);
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [rev, listId]);
  return { items, loading };
}
