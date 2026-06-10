import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { CompletedMode } from '../domain/itemTree';

// Lightweight, persisted UI preferences (not secret — SecureStore is just the available
// key/value store; no AsyncStorage in this project).

const KEY_DEBUG = 'lupira.tasks.debugEnabled';
const KEY_HIDE_COMPLETED = 'lupira.tasks.hideCompleted'; // legacy JSON map of listId → boolean
const KEY_COMPLETED_MODE = 'lupira.tasks.completedMode'; // JSON map of listId → CompletedMode

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
  load: () => Promise<void>;
  setDebugEnabled: (value: boolean) => Promise<void>;
  setCompletedMode: (listId: string, mode: CompletedMode) => Promise<void>;
};

export const usePrefs = create<PrefsState>((set, get) => ({
  loaded: false,
  debugEnabled: false,
  completedMode: {},

  load: async () => {
    const [debug, legacyHide, mode] = await Promise.all([
      SecureStore.getItemAsync(KEY_DEBUG),
      SecureStore.getItemAsync(KEY_HIDE_COMPLETED),
      SecureStore.getItemAsync(KEY_COMPLETED_MODE),
    ]);
    const completedMode = parseJson<Record<string, CompletedMode>>(mode, {});
    // Migrate the legacy boolean: a list that hid completed tasks becomes 'hidden' unless the
    // new pref already has an entry for it (completedMode wins).
    const hidden = parseJson<Record<string, boolean>>(legacyHide, {});
    for (const [listId, hide] of Object.entries(hidden)) {
      if (hide && !(listId in completedMode)) completedMode[listId] = 'hidden';
    }
    set({ debugEnabled: debug === 'true', completedMode, loaded: true });
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
}));
