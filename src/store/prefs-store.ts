import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Lightweight, persisted UI preferences (not secret — SecureStore is just the available
// key/value store; no AsyncStorage in this project).

const KEY_DEBUG = 'lupira.tasks.debugEnabled';
const KEY_HIDE_COMPLETED = 'lupira.tasks.hideCompleted'; // JSON map of listId → boolean

type PrefsState = {
  loaded: boolean;
  /** When true, the transient blue "Syncing…" banner is shown; off by default to reduce noise. */
  debugEnabled: boolean;
  /** Per-list: hide completed tasks in the list view. */
  hideCompleted: Record<string, boolean>;
  load: () => Promise<void>;
  setDebugEnabled: (value: boolean) => Promise<void>;
  setHideCompleted: (listId: string, value: boolean) => Promise<void>;
};

export const usePrefs = create<PrefsState>((set, get) => ({
  loaded: false,
  debugEnabled: false,
  hideCompleted: {},

  load: async () => {
    const [debug, hide] = await Promise.all([
      SecureStore.getItemAsync(KEY_DEBUG),
      SecureStore.getItemAsync(KEY_HIDE_COMPLETED),
    ]);
    let hideCompleted: Record<string, boolean> = {};
    if (hide) {
      try {
        hideCompleted = JSON.parse(hide) as Record<string, boolean>;
      } catch {
        hideCompleted = {};
      }
    }
    set({ debugEnabled: debug === 'true', hideCompleted, loaded: true });
  },

  setDebugEnabled: async value => {
    await SecureStore.setItemAsync(KEY_DEBUG, value ? 'true' : 'false');
    set({ debugEnabled: value });
  },

  setHideCompleted: async (listId, value) => {
    const next = { ...get().hideCompleted, [listId]: value };
    set({ hideCompleted: next });
    await SecureStore.setItemAsync(KEY_HIDE_COMPLETED, JSON.stringify(next));
  },
}));
