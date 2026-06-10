import { generateKeyBetween } from 'fractional-indexing';
import type { ItemState } from './itemState';

// Pure helpers for the nested task tree: build the visible (flattened) rows for rendering, the
// cascade-collapse of a node, and the sibling-only reorder target. Framework-free so it can be
// unit-tested in the node env (see itemTree.test.ts).

export interface VisibleRow {
  item: ItemState;
  depth: number;
  hasChildren: boolean;
}

/** Per-list display of completed tasks: in place, in a section below the open tasks, or hidden. */
export type CompletedMode = 'inline' | 'below' | 'hidden';

const bySort = (a: ItemState, b: ItemState) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0);

/** Group items by effective parent (a parent that isn't present → the item is treated as a root,
 *  so nothing disappears if a parent is missing). Each group is sorted by sortOrder. */
function byParent(items: ItemState[]): Map<string | null, ItemState[]> {
  const ids = new Set(items.map(i => i.id));
  const map = new Map<string | null, ItemState[]>();
  for (const it of items) {
    const parent = it.parentItemId && ids.has(it.parentItemId) ? it.parentItemId : null;
    const arr = map.get(parent);
    if (arr) arr.push(it);
    else map.set(parent, [it]);
  }
  for (const arr of map.values()) arr.sort(bySort);
  return map;
}

/** Flatten the item forest to visible rows (depth-first), descending only into expanded ids.
 *  When hideCompleted is true, completed items are skipped (their incomplete children, if any,
 *  surface as roots). */
export function buildVisibleRows(items: ItemState[], expanded: Set<string>, hideCompleted: boolean): VisibleRow[] {
  const src = hideCompleted ? items.filter(i => !i.completed) : items;
  const children = byParent(src);
  const rows: VisibleRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const it of children.get(parentId) ?? []) {
      const kids = children.get(it.id) ?? [];
      rows.push({ item: it, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && expanded.has(it.id)) walk(it.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Collapse `itemId` and all of its descendants (cascade), so re-expanding shows sublevels collapsed. */
export function collapseDescendants(expanded: Set<string>, itemId: string, items: ItemState[]): Set<string> {
  const children = byParent(items);
  const next = new Set(expanded);
  const remove = (id: string) => {
    next.delete(id);
    for (const c of children.get(id) ?? []) remove(c.id);
  };
  remove(itemId);
  return next;
}

/** All descendant ids of `itemId` (children, grandchildren, …) — used to delete a whole subtree. */
export function descendantIds(items: ItemState[], itemId: string): string[] {
  const children = byParent(items);
  const out: string[] = [];
  const walk = (id: string) => {
    for (const c of children.get(id) ?? []) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(itemId);
  return out;
}

/**
 * Sibling-only reorder target. Given the post-drop flattened `rows`, look at the dragged item's
 * siblings (same raw parent) in their new order and return the fractional key between its new
 * neighbors, keeping its parent unchanged. Returns null if it can't produce a valid key.
 */
export function siblingReorder(
  rows: VisibleRow[],
  draggedId: string,
): { sortOrder: string; parentItemId: string | null } | null {
  const dragged = rows.find(r => r.item.id === draggedId)?.item;
  if (!dragged) return null;
  const parentItemId = dragged.parentItemId ?? null;
  const siblings = rows.filter(r => (r.item.parentItemId ?? null) === parentItemId).map(r => r.item);
  const idx = siblings.findIndex(s => s.id === draggedId);
  if (idx < 0) return null;
  const prev = idx > 0 ? siblings[idx - 1].sortOrder : null;
  const next = idx < siblings.length - 1 ? siblings[idx + 1].sortOrder : null;
  if (prev !== null && next !== null && prev >= next) return null; // neighbors not ordered — bail
  try {
    return { sortOrder: generateKeyBetween(prev, next), parentItemId };
  } catch {
    return null;
  }
}

/** A parent's direct children, in sort order. */
export function childrenOf(items: ItemState[], parentId: string): ItemState[] {
  return items.filter(i => i.parentItemId === parentId).sort(bySort);
}

/** sortOrder for a new child appended after a parent's existing children. */
export function nextChildSortOrder(items: ItemState[], parentId: string): string {
  const kids = childrenOf(items, parentId);
  return generateKeyBetween(kids.length ? kids[kids.length - 1].sortOrder : null, null);
}
