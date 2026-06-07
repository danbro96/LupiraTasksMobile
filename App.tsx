import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/query/queryClient';
import { RootStack } from './src/navigation/RootStack';
import { useAuth } from './src/store/auth-store';
import { startSync } from './src/offline/outbox';

export default function App() {
  const loaded = useAuth(s => s.loaded);

  useEffect(() => {
    void (async () => {
      await useAuth.getState().load();
      await useAuth.getState().refreshIfNeeded();
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
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
