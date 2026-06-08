import { useEffect, useState } from 'react';
import { getDb, allOutboxRows } from '../../data/db';
import { useSyncStatus } from '../../sync/syncStatus';
import type { ClientOp } from '../../domain/ops';

export type OpStatus = 'pending' | 'failed';

/** The aggregate id an op affects: the list for a list op, else the item. */
function aggregateId(op: ClientOp): string {
  switch (op.kind) {
    case 'list.create':
    case 'list.rename':
    case 'list.recolor':
    case 'list.memberAdd':
    case 'list.memberRoleChange':
    case 'list.memberRemove':
    case 'list.leave':
    case 'list.delete':
    case 'list.archive':
    case 'list.restore':
      return op.listId;
    default:
      return op.itemId; // all item.* ops
  }
}

/**
 * Map of aggregate id (listId or itemId) → its outbox sync status, so list/item rows can show a
 * pending/failed badge. Re-reads whenever the mirror bumps or the pending/failed counts change
 * (i.e. after every enqueue and every drain). 'failed' (parked) wins over 'pending'.
 */
export function useOutboxStatus(): Map<string, OpStatus> {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const pending = useSyncStatus(s => s.pending);
  const failed = useSyncStatus(s => s.failed);
  const [map, setMap] = useState<Map<string, OpStatus>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await allOutboxRows(db);
      const next = new Map<string, OpStatus>();
      for (const r of rows) {
        const id = aggregateId(JSON.parse(r.op_json) as ClientOp);
        const status: OpStatus = r.status === 'parked' ? 'failed' : 'pending';
        if (next.get(id) === 'failed') continue; // failed wins
        next.set(id, status);
      }
      if (!cancelled) setMap(next);
    })();
    return () => { cancelled = true; };
  }, [rev, pending, failed]);

  return map;
}
