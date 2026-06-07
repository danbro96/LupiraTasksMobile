import { create } from 'zustand';

// Shared sync/offline status surfaced to the UI (offline banner + pending badge) and the
// mirror-revision counter screens subscribe to. Kept in its own module so both the outbox
// (push) and sync (pull) layers can import it without a circular dependency.

interface SyncStatus {
  online: boolean;
  /** Whether the last server contact succeeded (false = reachable host but request failed/timed out). */
  serverReachable: boolean;
  /** Count of outbox rows parked after a non-retryable failure (changes that didn't sync). */
  failed: number;
  /** Last sync/replay error message, for the banner / debugging. */
  lastError: string | null;
  pending: number;
  mirrorRevision: number;
  /** True once the first full sync attempt of this session has completed (success OR failure).
   *  Lets screens show a spinner instead of an "empty" state before the first pull lands. */
  firstSyncDone: boolean;
  setOnline: (online: boolean) => void;
  setServerReachable: (reachable: boolean) => void;
  setFailed: (failed: number) => void;
  setLastError: (lastError: string | null) => void;
  setPending: (pending: number) => void;
  setFirstSyncDone: (done: boolean) => void;
  bump: () => void;
}

export const useSyncStatus = create<SyncStatus>(set => ({
  online: true,
  serverReachable: true,
  failed: 0,
  lastError: null,
  pending: 0,
  mirrorRevision: 0,
  firstSyncDone: false,
  setOnline: online => set({ online }),
  setServerReachable: serverReachable => set({ serverReachable }),
  setFailed: failed => set({ failed }),
  setLastError: lastError => set({ lastError }),
  setPending: pending => set({ pending }),
  setFirstSyncDone: done => set({ firstSyncDone: done }),
  bump: () => set(s => ({ mirrorRevision: s.mirrorRevision + 1 })),
}));

/** Notify mirror subscribers (screens) that local data changed, so they reload. */
export function bumpMirror(): void {
  useSyncStatus.getState().bump();
}
