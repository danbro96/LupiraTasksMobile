import { useMemo } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { SyncBanner } from '../components/SyncBanner';
import { useAuth } from '../store/auth-store';
import { usePrefs } from '../store/prefs-store';
import { APP_VERSION } from '../config';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

export function AccountScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuth(s => s.user);
  const debugEnabled = usePrefs(s => s.debugEnabled);
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
