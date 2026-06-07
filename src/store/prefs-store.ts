import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Lightweight, persisted UI preferences (not secret — SecureStore is just the available
// key/value store; no AsyncStorage in this project). Room to grow (e.g. a theme override).

const KEY_DEBUG = 'lupira.tasks.debugEnabled';

type PrefsState = {
  loaded: boolean;
  /** When true, the transient blue "Syncing…" banner is shown; off by default to reduce noise. */
  debugEnabled: boolean;
  load: () => Promise<void>;
  setDebugEnabled: (value: boolean) => Promise<void>;
};

export const usePrefs = create<PrefsState>(set => ({
  loaded: false,
  debugEnabled: false,

  load: async () => {
    const v = await SecureStore.getItemAsync(KEY_DEBUG);
    set({ debugEnabled: v === 'true', loaded: true });
  },

  setDebugEnabled: async value => {
    await SecureStore.setItemAsync(KEY_DEBUG, value ? 'true' : 'false');
    set({ debugEnabled: value });
  },
}));
