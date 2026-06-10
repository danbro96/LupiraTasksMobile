import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { CompletedMode } from '../domain/itemTree';

// Lightweight, persisted UI preferences (not secret — SecureStore is just the available
// key/value store; no AsyncStorage in this project).

const KEY_DEBUG = 'lupira.tasks.debugEnabled';
const KEY_HIDE_COMPLETED = 'lupira.tasks.hideCompleted'; // legacy JSON map of listId → boolean
const KEY_COMPLETED_MODE = 'lupira.tasks.completedMode'; // JSON map of listId → CompletedMode
const KEY_TEXT_SIZE = 'lupira.tasks.textSize';
const KEY_ROW_SPACING = 'lupira.tasks.rowSpacing';

export type TextSize = 'small' | 'default' | 'large';
export type RowSpacing = 'compact' | 'default' | 'roomy';

/** Display mappings for the task rows (consumed by ListDetailScreen's style factory). */
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { small: 0.9, default: 1, large: 1.15 };
export const ROW_SPACING_PAD: Record<RowSpacing, number> = { compact: 10, default: 14, roomy: 18 };

function asOneOf<T extends string>(raw: string | null, values: readonly T[], fallback: T): T {
  return values.includes(raw as T) ? (raw as T) : fallback;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type PrefsState = {
  loaded: boolean;
  /** When true, the transient blue "Syncing…" banner is shown; off by default to reduce noise. */
  debugEnabled: boolean;
  /** Per-list: how completed tasks display (inline / section below / hidden). */
  completedMode: Record<string, CompletedMode>;
  /** App-wide: task row text size. */
  textSize: TextSize;
  /** App-wide: vertical padding between task rows. */
  rowSpacing: RowSpacing;
  load: () => Promise<void>;
  setDebugEnabled: (value: boolean) => Promise<void>;
  setCompletedMode: (listId: string, mode: CompletedMode) => Promise<void>;
  setTextSize: (value: TextSize) => Promise<void>;
  setRowSpacing: (value: RowSpacing) => Promise<void>;
};

export const usePrefs = create<PrefsState>((set, get) => ({
  loaded: false,
  debugEnabled: false,
  completedMode: {},
  textSize: 'default',
  rowSpacing: 'default',

  load: async () => {
    const [debug, legacyHide, mode, textSize, rowSpacing] = await Promise.all([
      SecureStore.getItemAsync(KEY_DEBUG),
      SecureStore.getItemAsync(KEY_HIDE_COMPLETED),
      SecureStore.getItemAsync(KEY_COMPLETED_MODE),
      SecureStore.getItemAsync(KEY_TEXT_SIZE),
      SecureStore.getItemAsync(KEY_ROW_SPACING),
    ]);
    const completedMode = parseJson<Record<string, CompletedMode>>(mode, {});
    // Migrate the legacy boolean: a list that hid completed tasks becomes 'hidden' unless the
    // new pref already has an entry for it (completedMode wins).
    const hidden = parseJson<Record<string, boolean>>(legacyHide, {});
    for (const [listId, hide] of Object.entries(hidden)) {
      if (hide && !(listId in completedMode)) completedMode[listId] = 'hidden';
    }
    set({
      debugEnabled: debug === 'true',
      completedMode,
      textSize: asOneOf(textSize, ['small', 'default', 'large'] as const, 'default'),
      rowSpacing: asOneOf(rowSpacing, ['compact', 'default', 'roomy'] as const, 'default'),
      loaded: true,
    });
  },

  setDebugEnabled: async value => {
    await SecureStore.setItemAsync(KEY_DEBUG, value ? 'true' : 'false');
    set({ debugEnabled: value });
  },

  setCompletedMode: async (listId, mode) => {
    const next = { ...get().completedMode, [listId]: mode };
    set({ completedMode: next });
    await SecureStore.setItemAsync(KEY_COMPLETED_MODE, JSON.stringify(next));
  },

  setTextSize: async value => {
    set({ textSize: value });
    await SecureStore.setItemAsync(KEY_TEXT_SIZE, value);
  },

  setRowSpacing: async value => {
    set({ rowSpacing: value });
    await SecureStore.setItemAsync(KEY_ROW_SPACING, value);
  },
}));
