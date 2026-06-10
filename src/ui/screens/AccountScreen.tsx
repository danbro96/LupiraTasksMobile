import { useMemo } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { ChipRow } from '../components/ChipRow';
import { SyncBanner } from '../components/SyncBanner';
import { useAuth } from '../../state/auth-store';
import { usePrefs, type RowSpacing, type TextSize } from '../../state/prefs-store';
import { APP_VERSION } from '../../config';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

const TEXT_SIZES = ['small', 'default', 'large'] as const;
const TEXT_SIZE_LABELS: Record<TextSize, string> = { small: 'Small', default: 'Default', large: 'Large' };
const ROW_SPACINGS = ['compact', 'default', 'roomy'] as const;
const ROW_SPACING_LABELS: Record<RowSpacing, string> = { compact: 'Compact', default: 'Default', roomy: 'Roomy' };

export function AccountScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuth(s => s.user);
  const debugEnabled = usePrefs(s => s.debugEnabled);
  const textSize = usePrefs(s => s.textSize);
  const rowSpacing = usePrefs(s => s.rowSpacing);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  function signOut() {
    Alert.alert('Sign out?', 'You will need to sign in with Authentik again to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void useAuth.getState().clearSession() },
    ]);
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <View style={styles.content}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={c.onPrimary} />
        </View>
        {user?.displayName ? <Text style={styles.name}>{user.displayName}</Text> : null}
        <Text style={styles.email}>{user?.sub ?? 'Not signed in'}</Text>

        <Button
          title="Archived lists"
          variant="secondary"
          onPress={() => nav.navigate('ArchivedLists')}
          style={styles.archived}
        />

        <Text style={styles.sectionLabel}>DISPLAY</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Task text size</Text>
          <ChipRow
            options={TEXT_SIZES}
            selected={textSize}
            onSelect={v => void usePrefs.getState().setTextSize(v)}
            getLabel={v => TEXT_SIZE_LABELS[v]}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Row spacing</Text>
          <ChipRow
            options={ROW_SPACINGS}
            selected={rowSpacing}
            onSelect={v => void usePrefs.getState().setRowSpacing(v)}
            getLabel={v => ROW_SPACING_LABELS[v]}
          />
        </View>

        <View style={styles.debugRow}>
          <View style={styles.debugLabelCol}>
            <Text style={styles.debugLabel}>Enable debug</Text>
            <Text style={styles.debugHint}>Show extra information</Text>
          </View>
          <Switch
            value={debugEnabled}
            onValueChange={v => void usePrefs.getState().setDebugEnabled(v)}
            trackColor={{ false: c.border, true: c.primary }}
            accessibilityLabel="Enable debug"
          />
        </View>

        {debugEnabled ? (
          <Button
            title="View debug log"
            variant="secondary"
            onPress={() => nav.navigate('DebugLog')}
            style={styles.debugLogBtn}
          />
        ) : null}

        <Button title="Sign out" variant="destructive" onPress={signOut} style={styles.signOut} />

        <Text style={styles.version}>Lupira Tasks v{APP_VERSION}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.xl, alignItems: 'center' },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: radii.round,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
    },
    name: { ...t.heading, marginBottom: spacing.xs },
    email: { ...t.small, marginBottom: spacing.xxl },
    archived: { alignSelf: 'stretch', marginBottom: spacing.md },
    sectionLabel: { ...t.sectionLabel, alignSelf: 'stretch', marginTop: spacing.lg, marginBottom: spacing.sm },
    settingRow: { alignSelf: 'stretch', marginBottom: spacing.md },
    settingLabel: { ...t.body, marginBottom: spacing.sm },
    debugLogBtn: { alignSelf: 'stretch', marginBottom: spacing.md },
    debugRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    debugLabelCol: { flex: 1, paddingRight: spacing.md },
    debugLabel: { ...t.body },
    debugHint: { ...t.small },
    signOut: { alignSelf: 'stretch' },
    version: { ...t.hint, marginTop: spacing.xxl },
  });
};
