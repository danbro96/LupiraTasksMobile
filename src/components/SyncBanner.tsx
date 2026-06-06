import { StyleSheet, Text, View } from 'react-native';
import { useSyncStatus } from '../offline/outbox';

/** Always-visible offline/sync state so queued edits feel trustworthy. */
export function SyncBanner() {
  const online = useSyncStatus(s => s.online);
  const pending = useSyncStatus(s => s.pending);

  if (online && pending === 0) return null;

  const label = online
    ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
    : pending > 0
      ? `Offline — ${pending} change${pending === 1 ? '' : 's'} pending`
      : 'Offline';

  return (
    <View style={[styles.banner, online ? styles.syncing : styles.offline]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: 6, paddingHorizontal: 14 },
  offline: { backgroundColor: '#5b4b18' },
  syncing: { backgroundColor: '#1d3a5f' },
  text: { color: '#fff', fontSize: 13, textAlign: 'center' },
});
