import { StyleSheet, View } from 'react-native';
import type { OpStatus } from '../hooks/useOutboxStatus';
import { useColors } from '../theme';

/** Tiny per-row sync indicator: amber = queued (pending), red = failed to sync. Nothing when synced. */
export function SyncDot({ status }: { status?: OpStatus }) {
  const c = useColors();
  if (!status) return null;
  return (
    <View
      accessibilityLabel={status === 'failed' ? 'Failed to sync' : 'Waiting to sync'}
      style={[styles.dot, { backgroundColor: status === 'failed' ? c.failed : c.pending }]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 9, height: 9, borderRadius: 5 },
});
