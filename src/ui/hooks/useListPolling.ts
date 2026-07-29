import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LIST_POLL_MS } from '../../config';
import { useSyncStatus } from '../../sync/syncStatus';
import { drainOutbox } from '../../sync/outbox';
import { pullList } from '../../sync/sync';
import { logDebug } from '../../debug/log';

/**
 * Keep an open list fresh: while its screen is focused and the app is foregrounded, push pending
 * local edits and re-pull every LIST_POLL_MS. The pull always re-applies the server base; the read
 * hooks (useMirror) are what suppress a re-render when the rows came back unchanged.
 */
export function useListPolling(listId: string): void {
  useFocusEffect(
    useCallback(() => {
      if (LIST_POLL_MS <= 0) return;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      // Self-scheduling timeout, not setInterval: at most one pull in flight, and a slow tick
      // stretches the cadence instead of stacking requests.
      const schedule = () => { timer = setTimeout(() => void tick(), LIST_POLL_MS); };

      const tick = async () => {
        const { online, pending } = useSyncStatus.getState();
        const state = AppState.currentState;
        // Skip the request while offline or backgrounded, but keep the chain alive — a regained
        // connection or a foreground already triggers a full sync of its own. Logged because both
        // gates are otherwise invisible: a wrongly-stuck one looks exactly like "polling is broken".
        if (!online || state !== 'active') {
          logDebug('poll:skip', online ? `appState=${state}` : 'offline');
        } else {
          try {
            if (pending > 0) await drainOutbox(); // push before pull, as runSync does
            await pullList(listId);
            logDebug('poll', listId);
          } catch (e) {
            // Surfaced by the sync banner; a failed tick must not break the loop.
            logDebug('poll:error', e instanceof Error ? e.message : String(e));
          }
        }
        if (!stopped) schedule();
      };

      schedule();
      return () => { stopped = true; clearTimeout(timer); };
    }, [listId]),
  );
}
