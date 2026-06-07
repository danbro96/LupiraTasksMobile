import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/query/queryClient';
import { RootStack } from './src/navigation/RootStack';
import { ToastHost } from './src/components/Toast';
import { useAuth } from './src/store/auth-store';
import { startSync, syncAll } from './src/offline/sync';
import { SENTRY_DSN } from './src/config';

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

  useEffect(() => {
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
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <RootStack />
        </NavigationContainer>
      </QueryClientProvider>
      <ToastHost />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
