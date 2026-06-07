import type { ClientOp } from './ops';

// Pure helpers for reasoning about which list an outbox row touches. Kept free of any
// SQLite/API imports so they run under the node unit-test harness. Every ClientOp carries
// a `listId`, so an op's serialized JSON always yields one.

/** The listId an outbox row's serialized op targets. */
export function rowListId(opJson: string): string {
  return (JSON.parse(opJson) as ClientOp).listId;
}

/**
 * Rows whose op targets `listId`. Used to scope a list's rebase to its own pending ops, so
 * pulling N lists doesn't re-apply (and re-write) every other list's pending ops N times.
 */
export function rowsForList<T extends { op_json: string }>(rows: T[], listId: string): T[] {
  return rows.filter(r => rowListId(r.op_json) === listId);
}

/** The distinct listIds referenced by the given rows — used to protect lists from prune. */
export function listIdsOf(rows: { op_json: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) ids.add(rowListId(r.op_json));
  return ids;
}
