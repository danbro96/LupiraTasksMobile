import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { List, Switch, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { SegmentedPicker } from '../components/SegmentedPicker';
import { SyncBanner } from '../components/SyncBanner';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../../state/auth-store';
import { usePrefs, type RowSpacing, type TextSize } from '../../state/prefs-store';
import { APP_VERSION } from '../../config';
import { radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

const TEXT_SIZES = ['small', 'default', 'large'] as const;
const TEXT_SIZE_LABELS: Record<TextSize, string> = { small: 'Small', default: 'Default', large: 'Large' };
const ROW_SPACINGS = ['compact', 'default', 'roomy'] as const;
const ROW_SPACING_LABELS: Record<RowSpacing, string> = { compact: 'Compact', default: 'Default', roomy: 'Roomy' };

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuth(s => s.user);
  const debugEnabled = usePrefs(s => s.debugEnabled);
  const textSize = usePrefs(s => s.textSize);
  const rowSpacing = usePrefs(s => s.rowSpacing);
  const confirm = useConfirm();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  async function signOut() {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in with Authentik again to get back in.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (ok) await useAuth.getState().clearSession();
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <MaterialIcons name={ICONS.account} size={32} color={c.onPrimary} />
          </View>
          {user?.displayName ? <Text variant="titleLarge">{user.displayName}</Text> : null}
          <Text variant="bodySmall" style={styles.email}>{user?.sub ?? 'Not signed in'}</Text>
        </View>

        <List.Subheader>Account</List.Subheader>
        <List.Item title="Archived lists" onPress={() => nav.navigate('ArchivedLists')} />
        <View style={styles.action}>
          <Button title="Sign out" variant="destructive" onPress={() => void signOut()} />
        </View>

        <List.Subheader>Display</List.Subheader>
        <List.Item title="Task text size" />
        <View style={styles.picker}>
          <SegmentedPicker
            options={TEXT_SIZES}
            selected={textSize}
            onSelect={v => void usePrefs.getState().setTextSize(v)}
            getLabel={v => TEXT_SIZE_LABELS[v]}
          />
        </View>
        <List.Item title="Row spacing" />
        <View style={styles.picker}>
          <SegmentedPicker
            options={ROW_SPACINGS}
            selected={rowSpacing}
            onSelect={v => void usePrefs.getState().setRowSpacing(v)}
            getLabel={v => ROW_SPACING_LABELS[v]}
          />
        </View>

        <List.Subheader>About</List.Subheader>
        <Text variant="labelSmall" style={styles.version}>Lupira Tasks v{APP_VERSION}</Text>

        <List.Subheader>Developer</List.Subheader>
        <List.Item
          title="Enable debug"
          description="Show the developer tools and the on-device log"
          right={() => (
            <Switch
              value={debugEnabled}
              onValueChange={v => void usePrefs.getState().setDebugEnabled(v)}
              accessibilityLabel="Enable debug"
            />
          )}
        />
        {debugEnabled ? (
          <List.Item title="Developer options" onPress={() => nav.navigate('Developer')} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: spacing.xxl },
    identity: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: radii.round,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    email: { color: c.textMuted },
    action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    picker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    version: { color: c.textSubtle, paddingHorizontal: spacing.lg },
  });
