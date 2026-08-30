import { useEffect } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import * as ExpoLinking from 'expo-linking';
import { RootStack } from './src/ui/navigation/RootStack';
import type { RootStackParamList } from './src/ui/navigation/types';
import { ToastHost } from './src/ui/components/ToastHost';
import { ConfirmDialogHost } from './src/ui/components/ConfirmDialog';
import { useAuth } from './src/state/auth-store';
import { usePrefs } from './src/state/prefs-store';
import { startSync, syncAll } from './src/sync/sync';
import { SENTRY_DSN, APP_VERSION } from './src/config';
import { lightColors, darkColors, navDark, navLight, paperDark, paperLight, type Palette } from './src/ui/theme';
import { paperSettings } from './src/ui/theme/paperSettings';

// Crash analytics. SENTRY_DSN is a public client key in src/config.ts — Sentry no-ops when empty.
// release/dist tie events to a version (and let source maps resolve); environment separates dev
// noise from production crashes.
const sentryDsn = SENTRY_DSN;
Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  release: APP_VERSION,
  dist: APP_VERSION,
  environment: __DEV__ ? 'development' : 'production',
});

// Deep links: lupiratasks://task/<listId>/<itemId> (minted by e.g. the calendar's TaskCard). The OIDC
// callback (lupiratasks://oauthredirect) must never reach navigation — expo-auth-session owns it; when
// signed out, TaskDetail isn't mounted and react-navigation drops the link on Login (no replay).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [ExpoLinking.createURL('/'), 'lupiratasks://'],
  filter: url => !url.includes('oauthredirect'),
  config: { screens: { TaskDetail: 'task/:listId/:itemId' } },
};

/** Last-resort fallback shown when a render crash is caught (and reported) by the error boundary. */
function ErrorFallback({ palette }: { palette: Palette }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: palette.bg }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: palette.text, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: palette.textMuted, textAlign: 'center' }}>
        The app hit an unexpected error. Please reopen it — your data is saved on this device.
      </Text>
    </View>
  );
}

function App() {
  const loaded = useAuth(s => s.loaded);
  const scheme = useColorScheme();

  useEffect(() => {
    void usePrefs.getState().load();
    void (async () => {
      await useAuth.getState().load();
      await useAuth.getState().refreshIfNeeded();
      // Initial load from the server (no-op if not signed in). Subsequent syncs fire on
      // reconnect/foreground via startSync, and per-list on open/pull-to-refresh.
      void syncAll();
    })();
    const stopSync = startSync();
    return stopSync;
  }, []);

  if (!loaded) return null;

  const palette = scheme === 'dark' ? darkColors : lightColors;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={scheme === 'dark' ? paperDark : paperLight} settings={paperSettings}>
          <Sentry.ErrorBoundary fallback={<ErrorFallback palette={palette} />}>
            <ConfirmDialogHost>
              <NavigationContainer theme={scheme === 'dark' ? navDark : navLight} linking={linking}>
                <RootStack />
              </NavigationContainer>
            </ConfirmDialogHost>
          </Sentry.ErrorBoundary>
          <ToastHost />
          <StatusBar style="auto" />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
