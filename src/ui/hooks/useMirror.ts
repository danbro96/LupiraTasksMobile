import { useEffect, useRef, useState } from 'react';
import type { ListResponse } from '../../data/api/generated/models';
import type { ItemState } from '../../domain/itemState';
import { diffItems, type ItemChange } from '../../domain/itemChange';
import { sortActiveLists, sortArchivedLists } from '../../domain/listOrder';
import { getDb, getItemsByList, getListDocs, getArchivedListDocs } from '../../data/db';
import { useSyncStatus } from '../../sync/syncStatus';
import { logDebug } from '../../debug/log';

// Read hooks over the offline SQLite mirror. They reload whenever `mirrorRevision` bumps
// (after any enqueue or pull). Each effect drops its result if a newer bump superseded it —
// two overlapping reloads resolving out of order must not leave stale data on screen.

/** A failed read keeps the last good rows on screen; the next bump retries. Caught rather than
 *  left to reject so it doesn't surface as an unhandled rejection with no context. */
function logReadError(stage: string, e: unknown): void {
  logDebug(`${stage}:error`, e instanceof Error ? e.message : String(e));
}

/**
 * Gate on the read's content, not on the fact a reload ran — a polled pull rewrites the same rows
 * every few seconds, and fresh objects would re-render every task row for nothing.
 *
 * Serializes rather than trusting a version field: the comparison then can't miss a change and
 * leave the screen stale, the one failure mode that matters here.
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
      const docs = sortActiveLists(await getListDocs<ListResponse>(db));
      logDebug('useLists', `count=${docs.length}`); // diagnostic: is the optimistic list in the mirror?
      if (!cancelled) publish(docs, setLists);
    })().catch(e => logReadError('useLists', e));
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
      const docs = sortArchivedLists(await getArchivedListDocs<ListResponse>(db));
      if (!cancelled) publish(docs, setLists);
    })().catch(e => logReadError('useArchivedLists', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish is a stable ref-backed closure
  }, [rev]);
  return { lists };
}

/**
 * A list's items, plus what the latest reload changed when it came from a pull rather than the
 * user's own tap. `changes` carries a nonce so an identical repeat still reads as a new event.
 */
export function useItems(listId: string): {
  items: ItemState[];
  loading: boolean;
  changes: { nonce: number; list: ItemChange[] };
} {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [items, setItems] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<{ nonce: number; list: ItemChange[] }>({ nonce: 0, list: [] });
  // Keyed by list: diffing against another list's read would report every row as added.
  const prev = useRef<{ listId: string; rows: Map<string, ItemState> }>({ listId, rows: new Map() });
  const publish = useUnchangedGuard<ItemState>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await getItemsByList(db, listId);
      if (cancelled) return;
      // Read, don't subscribe: only the revision should retrigger this effect.
      const remote = useSyncStatus.getState().mirrorOrigin === 'pull';
      const same = prev.current.listId === listId;
      const diff = remote && same ? diffItems(prev.current.rows, rows) : [];
      prev.current = { listId, rows: new Map(rows.map(r => [r.id, r])) };
      publish(rows, setItems);
      if (diff.length > 0) setChanges(c => ({ nonce: c.nonce + 1, list: diff }));
      setLoading(false);
    })().catch(e => {
      logReadError('useItems', e);
      if (!cancelled) setLoading(false); // never leave the screen on its initial-load spinner
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publish is a stable ref-backed closure
  }, [rev, listId]);
  return { items, loading, changes };
}
