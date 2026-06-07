import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';
import { ListsScreen } from '../screens/ListsScreen';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { ListSettingsScreen } from '../screens/ListSettingsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { useAuth } from '../store/auth-store';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  const authed = useAuth(s => !!s.token && !!s.user);

  return (
    <Stack.Navigator>
      {authed ? (
        <>
          <Stack.Screen
            name="Lists"
            component={ListsScreen}
            options={{
              title: 'Lupira Tasks',
              headerRight: () => (
                <Pressable onPress={() => void useAuth.getState().clearSession()} hitSlop={8}>
                  <Text style={{ color: '#1d3a5f', fontSize: 15 }}>Sign out</Text>
                </Pressable>
              ),
            }}
          />
          <Stack.Screen
            name="ListDetail"
            component={ListDetailScreen}
            options={({ route }) => ({ title: route.params.name })}
          />
          <Stack.Screen
            name="ListSettings"
            component={ListSettingsScreen}
            options={{ title: 'List settings' }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
