import { useCallback, useEffect, useState } from 'react';
import type { ListResponse } from '../../data/api/generated/models';
import type { ItemState } from '../../domain/itemState';
import { getDb, getItemsByList, getListDocs, getArchivedListDocs } from '../../data/db';
import { useSyncStatus } from '../../sync/syncStatus';
import { logDebug } from '../../debug/log';

// Read hooks over the offline SQLite mirror. They reload whenever `mirrorRevision` bumps
// (after any enqueue or pull), so optimistic edits show instantly without the network.

export function useLists(): { lists: ListResponse[]; loading: boolean } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [lists, setLists] = useState<ListResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const db = await getDb();
    const docs = await getListDocs<ListResponse>(db);
    logDebug('useLists', `count=${docs.length}`); // diagnostic: is the optimistic list in the mirror?
    setLists(docs);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload, rev]);
  return { lists, loading };
}

export function useArchivedLists(): { lists: ListResponse[]; loading: boolean } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [lists, setLists] = useState<ListResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const db = await getDb();
    setLists(await getArchivedListDocs<ListResponse>(db));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload, rev]);
  return { lists, loading };
}

export function useItems(listId: string): { items: ItemState[]; loading: boolean } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [items, setItems] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const db = await getDb();
    setItems(await getItemsByList(db, listId));
    setLoading(false);
  }, [listId]);

  useEffect(() => { void reload(); }, [reload, rev]);
  return { items, loading };
}
