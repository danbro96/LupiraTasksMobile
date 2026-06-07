import { StyleSheet, View } from 'react-native';
import type { OpStatus } from '../offline/useOutboxStatus';

/** Tiny per-row sync indicator: amber = queued (pending), red = failed to sync. Nothing when synced. */
export function SyncDot({ status }: { status?: OpStatus }) {
  if (!status) return null;
  return (
    <View
      accessibilityLabel={status === 'failed' ? 'Failed to sync' : 'Waiting to sync'}
      style={[styles.dot, status === 'failed' ? styles.failed : styles.pending]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 9, height: 9, borderRadius: 5 },
  pending: { backgroundColor: '#d8a200' },
  failed: { backgroundColor: '#b3261e' },
});
