import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSyncStatus } from '../../sync/syncStatus';
import { usePrefs } from '../../state/prefs-store';
import { bannerState } from '../../domain/bannerState';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

/** Always-visible sync/error state so offline edits, unreachable server, and failures are obvious. */
export function SyncBanner() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const online = useSyncStatus(s => s.online);
  const serverReachable = useSyncStatus(s => s.serverReachable);
  const pending = useSyncStatus(s => s.pending);
  const failed = useSyncStatus(s => s.failed);
  const lastError = useSyncStatus(s => s.lastError);
  const debugEnabled = usePrefs(s => s.debugEnabled);

  const state = bannerState({ online, serverReachable, pending, failed, lastError });
  if (!state) return null;
  // The routine "Syncing…" banner is noise on every action — show it only in debug mode.
  // Connectivity/failure states always show.
  if (state.kind === 'syncing' && !debugEnabled) return null;

  // Failed changes are the only state with a recovery action — tap to open "Sync issues".
  if (state.kind === 'failed') {
    return (
      <Pressable
        onPress={() => nav.navigate('SyncIssues')}
        style={[styles.banner, styles.failed]}
        accessibilityRole="button"
        accessibilityLabel={`${state.text}. Tap to review.`}
      >
        <Text style={styles.text}>{state.text} ›</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.banner, styles[state.kind]]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={styles.text}>{state.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: 6, paddingHorizontal: spacing.md },
  offline: { backgroundColor: colors.bannerOffline },
  unreachable: { backgroundColor: colors.bannerUnreachable },
  failed: { backgroundColor: colors.bannerUnreachable },
  syncing: { backgroundColor: colors.bannerSyncing },
  error: { backgroundColor: colors.bannerUnreachable },
  text: { color: '#fff', fontSize: 13, textAlign: 'center' },
});
