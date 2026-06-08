import { useEffect } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme, type Theme } from '@react-navigation/native';
import { RootStack } from './src/navigation/RootStack';
import { ToastHost } from './src/components/Toast';
import { useAuth } from './src/store/auth-store';
import { usePrefs } from './src/store/prefs-store';
import { startSync, syncAll } from './src/offline/sync';
import { SENTRY_DSN, APP_VERSION } from './src/config';
import { lightColors, darkColors, type Palette } from './src/theme';

/** React Navigation theme derived from our palette so headers/backgrounds match the app. */
function navTheme(scheme: string | null | undefined): Theme {
  const p = scheme === 'dark' ? darkColors : lightColors;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: { ...base.colors, primary: p.primary, background: p.bg, card: p.bg, text: p.text, border: p.divider, notification: p.danger },
  };
}

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
        <Sentry.ErrorBoundary fallback={<ErrorFallback palette={palette} />}>
          <NavigationContainer theme={navTheme(scheme)}>
            <RootStack />
          </NavigationContainer>
        </Sentry.ErrorBoundary>
        <ToastHost />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
