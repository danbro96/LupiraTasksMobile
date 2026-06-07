import { create } from 'zustand';
import * as Sentry from '@sentry/react-native';

// Shared in-memory debug trace, rendered on-device by DebugPanel (in __DEV__), echoed to the
// console (Metro / `react-native log-android`), and recorded as Sentry breadcrumbs. Used by the
// auth flow and the offline outbox/sync path to diagnose issues without a terminal attached.

export interface DebugLogEntry {
  t: string; // ISO timestamp
  stage: string;
  detail?: string;
}

interface DebugLogState {
  entries: DebugLogEntry[];
  push: (e: DebugLogEntry) => void;
  clear: () => void;
}

const MAX_ENTRIES = 200;

export const useDebugLog = create<DebugLogState>(set => ({
  entries: [],
  push: e => set(s => ({ entries: [...s.entries, e].slice(-MAX_ENTRIES) })),
  clear: () => set({ entries: [] }),
}));

/** Record one stage to the buffer, the console, and a Sentry breadcrumb. No PII in details. */
export function logDebug(stage: string, detail?: string): void {
  const t = new Date().toISOString();
  useDebugLog.getState().push({ t, stage, detail });
  // eslint-disable-next-line no-console
  console.log('[debug]', stage, detail ?? '');
  try {
    Sentry.addBreadcrumb({
      category: 'debug',
      level: 'info',
      message: stage,
      data: detail ? { detail } : undefined,
    });
  } catch {
    // Sentry not initialised yet — the buffer + console still capture it.
  }
}

export function clearDebugLog(): void {
  useDebugLog.getState().clear();
}
