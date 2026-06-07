import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { SyncBanner } from '../components/SyncBanner';
import { useAuth } from '../store/auth-store';
import { APP_VERSION } from '../config';
import { colors, radii, spacing, type } from '../theme';

export function AccountScreen() {
  const user = useAuth(s => s.user);

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
          <Ionicons name="person" size={32} color={colors.onPrimary} />
        </View>
        {user?.displayName ? <Text style={styles.name}>{user.displayName}</Text> : null}
        <Text style={styles.email}>{user?.sub ?? 'Not signed in'}</Text>

        <Button title="Sign out" variant="destructive" onPress={signOut} style={styles.signOut} />

        <Text style={styles.version}>Lupira Tasks v{APP_VERSION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radii.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  name: { ...type.heading, marginBottom: spacing.xs },
  email: { ...type.small, marginBottom: spacing.xxl },
  signOut: { alignSelf: 'stretch' },
  version: { ...type.hint, marginTop: spacing.xxl },
});
