import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
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
import { SENTRY_DSN } from './src/config';
import { lightColors, darkColors } from './src/theme';

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
const sentryDsn = SENTRY_DSN;
Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
});

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme(scheme)}>
          <RootStack />
        </NavigationContainer>
        <ToastHost />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
