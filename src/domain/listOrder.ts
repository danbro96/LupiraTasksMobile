import { generateKeyBetween } from 'fractional-indexing';

// Pure helpers for the lists screen's order. The position is per-user and server-authoritative:
// `sortOrder` on a ListDto is the CALLER's own fractional-index key (null until they first
// drag it). Framework-free so it can be unit-tested in the node env (see listOrder.test.ts).

/** The subset of a list doc these helpers order by — structural so ListDto satisfies it. */
export interface OrderableList {
  id: string;
  name: string;
  sortOrder?: string | null;
  archivedAt?: string | null;
  updatedAt: string;
}

/** One list's new position, as the `list.reorder` op carries it. */
export interface ListOrderTarget {
  listId: string;
  sortOrder: string;
}

const byName = (a: OrderableList, b: OrderableList) =>
  a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;

/**
 * Active lists in display order: the ones the user has dragged first (by key), then the ones they
 * never have, by name. Matches the server's `GET /lists` order, so a pull can't reshuffle the screen.
 */
export function sortActiveLists<T extends OrderableList>(lists: readonly T[]): T[] {
  const keyed = lists.filter(l => l.sortOrder);
  const rest = lists.filter(l => !l.sortOrder);
  keyed.sort((a, b) => (a.sortOrder! < b.sortOrder! ? -1 : a.sortOrder! > b.sortOrder! ? 1 : byName(a, b)));
  rest.sort(byName);
  return [...keyed, ...rest];
}

/** Archived lists, most recently archived first. `updatedAt` only covers docs written before
 *  `archivedAt` existed (a pre-rebuild snapshot or an older mirror row). Compares parsed instants,
 *  not the raw strings: two timestamps with different UTC offsets don't sort lexicographically. */
export function sortArchivedLists<T extends OrderableList>(lists: readonly T[]): T[] {
  const at = (l: OrderableList) => Date.parse(l.archivedAt ?? l.updatedAt) || 0;
  return [...lists].sort((a, b) => at(b) - at(a));
}

/**
 * The order changes a drag from index `from` to `to` implies, over `lists` as currently displayed.
 *
 * Normally one target: the fractional key between the dragged list's new neighbors. But a key only
 * positions a list against OTHER keyed lists — while neighbors are still unkeyed the dragged row
 * would sort above the whole unkeyed bucket instead of landing between them. So the first drag
 * returns a target for every list, materializing the order the user is already looking at; every
 * later drag is a single target. Returns [] when the drag is a no-op or no valid key exists.
 */
export function planListReorder(lists: readonly OrderableList[], from: number, to: number): ListOrderTarget[] {
  if (from === to || from < 0 || to < 0 || from >= lists.length || to >= lists.length) return [];
  const next = [...lists];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  try {
    if (next.some(l => !l.sortOrder)) {
      let prev: string | null = null;
      return next.map(l => {
        prev = generateKeyBetween(prev, null);
        return { listId: l.id, sortOrder: prev };
      });
    }
    const idx = next.findIndex(l => l.id === moved.id);
    const before = idx > 0 ? next[idx - 1].sortOrder! : null;
    const after = idx < next.length - 1 ? next[idx + 1].sortOrder! : null;
    if (before !== null && after !== null && before >= after) return []; // neighbors not ordered — bail
    return [{ listId: moved.id, sortOrder: generateKeyBetween(before, after) }];
  } catch {
    return [];
  }
}
