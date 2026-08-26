import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Banner, Text } from 'react-native-paper';
import { useSyncStatus } from '../../sync/syncStatus';
import { usePrefs } from '../../state/prefs-store';
import { bannerState } from '../../domain/bannerState';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

/** Always-visible sync/error state so offline edits, unreachable server, and failures are obvious. */
export function SyncBanner() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c = useColors();
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

  const background =
    state.kind === 'offline' ? c.bannerOffline : state.kind === 'syncing' ? c.bannerSyncing : c.bannerUnreachable;

  return (
    <Banner
      visible
      style={{ backgroundColor: background }}
      accessibilityLiveRegion="polite"
      // Failed changes are the only state with a recovery action.
      actions={state.kind === 'failed' ? [{ label: 'Review', onPress: () => nav.navigate('SyncIssues') }] : []}
    >
      {/* The banner tones are dark in both schemes, so the label stays light. */}
      <Text variant="bodySmall" style={{ color: '#fff' }}>
        {state.text}
      </Text>
    </Banner>
  );
}
