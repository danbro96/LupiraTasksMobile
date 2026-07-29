import { useEffect, useRef, useState } from 'react';
import type { ListResponse } from '../../data/api/generated/models';
import type { ItemState } from '../../domain/itemState';
import { getDb, getItemsByList, getListDocs, getArchivedListDocs } from '../../data/db';
import { useSyncStatus } from '../../sync/syncStatus';
import { logDebug } from '../../debug/log';

// Read hooks over the offline SQLite mirror. They reload whenever `mirrorRevision` bumps
// (after any enqueue or pull). Each effect drops its result if a newer bump superseded it —
// two overlapping reloads resolving out of order must not leave stale data on screen.

/**
 * Gate on the read's content, not on the fact a reload ran: a polled pull re-writes the same rows
 * every few seconds, and handing the screen fresh objects each time would re-render every task row
 * (and re-run its layout animation) with nothing to show for it.
 *
 * Deliberately serialize the rows rather than trust a version/timestamp field — the comparison
 * cannot then miss a change and leave the screen stale, which is the only failure mode that matters
 * here. Both queries build their rows the same way every time, so key order is stable.
 */
function useUnchangedGuard<T>(): (rows: T[], apply: (rows: T[]) => void) => void {
  const last = useRef<string | null>(null);
  return (rows, apply) => {
    const fp = JSON.stringify(rows);
    if (fp === last.current) return;
    last.current = fp;
    apply(rows);
  };
}

export function useLists(): { lists: ListResponse[] } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [lists, setLists] = useState<ListResponse[]>([]);
  const publish = useUnchangedGuard<ListResponse>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const docs = await getListDocs<ListResponse>(db);
      logDebug('useLists', `count=${docs.length}`); // diagnostic: is the optimistic list in the mirror?
      if (!cancelled) publish(docs, setLists);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish is a stable ref-backed closure
  }, [rev]);
  return { lists };
}

export function useArchivedLists(): { lists: ListResponse[] } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [lists, setLists] = useState<ListResponse[]>([]);
  const publish = useUnchangedGuard<ListResponse>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const docs = await getArchivedListDocs<ListResponse>(db);
      if (!cancelled) publish(docs, setLists);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish is a stable ref-backed closure
  }, [rev]);
  return { lists };
}

export function useItems(listId: string): { items: ItemState[]; loading: boolean } {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [items, setItems] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const publish = useUnchangedGuard<ItemState>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await getItemsByList(db, listId);
      if (cancelled) return;
      publish(rows, setItems);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish is a stable ref-backed closure
  }, [rev, listId]);
  return { items, loading };
}
