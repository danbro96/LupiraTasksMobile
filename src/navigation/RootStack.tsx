import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ListsScreen } from '../screens/ListsScreen';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { ListSettingsScreen } from '../screens/ListSettingsScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { SyncIssuesScreen } from '../screens/SyncIssuesScreen';
import { CreateListScreen } from '../screens/CreateListScreen';
import { ArchivedListsScreen } from '../screens/ArchivedListsScreen';
import { DebugLogScreen } from '../screens/DebugLogScreen';
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
          <Stack.Screen name="Lists" component={ListsScreen} options={{ title: 'Lupira Tasks' }} />
          <Stack.Screen name="ListDetail" component={ListDetailScreen} options={({ route }) => ({ title: route.params.name })} />
          <Stack.Screen name="ListSettings" component={ListSettingsScreen} options={{ title: 'List settings' }} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task' }} />
          <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
          <Stack.Screen name="SyncIssues" component={SyncIssuesScreen} options={{ title: 'Sync issues' }} />
          <Stack.Screen name="CreateList" component={CreateListScreen} options={{ title: 'New list', presentation: 'modal' }} />
          <Stack.Screen name="ArchivedLists" component={ArchivedListsScreen} options={{ title: 'Archived lists' }} />
          <Stack.Screen name="DebugLog" component={DebugLogScreen} options={{ title: 'Debug log' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
