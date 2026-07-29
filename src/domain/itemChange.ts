import type { ItemState } from './itemState';
import type { Guid } from './events';

// What changed about an item when someone else edited it, so the list can say so instead of
// silently redrawing the row. Pure + framework-free (see itemChange.test.ts).

export type ItemChangeKind = 'added' | 'completed' | 'reopened' | 'renamed' | 'updated';

export interface ItemChange {
  itemId: Guid;
  kind: ItemChangeKind;
  /** Principal id of who did it, when the state records one (completion only), else null. */
  actor: string | null;
}

// Fields the row renders — a change confined to the LWW guards or updatedAt is invisible, and
// flashing over it would be noise. No `deleted`: tombstones never reach here (the query filters
// them), so a remote delete leaves the set rather than changing within it.
const VISIBLE: (keyof ItemState)[] = [
  'title', 'notes', 'completed', 'priority', 'dueAt', 'assignedTo',
  'quantity', 'unit', 'parentItemId',
];

function visiblyDiffers(a: ItemState, b: ItemState): boolean {
  return VISIBLE.some(k => a[k] !== b[k]);
}

/**
 * Diff a fresh read of a list's items against the previous one. Empty `prev` yields nothing — a
 * first load is not a set of changes. sortOrder is excluded: a remote reorder animates itself, and
 * highlighting every moved row would drown the real edits.
 */
export function diffItems(prev: Map<Guid, ItemState>, next: readonly ItemState[]): ItemChange[] {
  if (prev.size === 0) return [];
  const out: ItemChange[] = [];
  for (const item of next) {
    const before = prev.get(item.id);
    if (!before) {
      out.push({ itemId: item.id, kind: 'added', actor: item.createdBy });
      continue;
    }
    if (before.completed !== item.completed) {
      out.push({
        itemId: item.id,
        kind: item.completed ? 'completed' : 'reopened',
        actor: item.completed ? item.completedBy : before.completedBy,
      });
    } else if (before.title !== item.title) {
      out.push({ itemId: item.id, kind: 'renamed', actor: null });
    } else if (visiblyDiffers(before, item)) {
      out.push({ itemId: item.id, kind: 'updated', actor: null });
    }
  }
  return out;
}

const VERB: Record<ItemChangeKind, string> = {
  added: 'added',
  completed: 'completed',
  reopened: 'reopened',
  renamed: 'renamed',
  updated: 'changed',
};

/** First name only — a full name or an email fallback won't fit beside the title. */
function firstName(who: string): string {
  return who.trim().split(/\s+/)[0].split('@')[0];
}

/** Two words at most — the label shares the title's line, so anything longer ellipsises. */
export function changeLabel(kind: ItemChangeKind, who: string | null): string {
  const verb = VERB[kind];
  const name = who ? firstName(who) : '';
  return name ? `${name} ${verb}` : `${verb[0].toUpperCase()}${verb.slice(1)} elsewhere`;
}
