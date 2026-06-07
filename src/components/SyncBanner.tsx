import { StyleSheet, Text, View } from 'react-native';
import { useSyncStatus } from '../offline/syncStatus';
import { bannerState } from '../offline/bannerState';

/** Always-visible sync/error state so offline edits, unreachable server, and failures are obvious. */
export function SyncBanner() {
  const online = useSyncStatus(s => s.online);
  const serverReachable = useSyncStatus(s => s.serverReachable);
  const pending = useSyncStatus(s => s.pending);
  const failed = useSyncStatus(s => s.failed);

  const state = bannerState({ online, serverReachable, pending, failed });
  if (!state) return null;

  return (
    <View style={[styles.banner, styles[state.kind]]}>
      <Text style={styles.text}>{state.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: 6, paddingHorizontal: 14 },
  offline: { backgroundColor: '#5b4b18' },
  unreachable: { backgroundColor: '#7a1f1f' },
  failed: { backgroundColor: '#7a1f1f' },
  syncing: { backgroundColor: '#1d3a5f' },
  text: { color: '#fff', fontSize: 13, textAlign: 'center' },
});
