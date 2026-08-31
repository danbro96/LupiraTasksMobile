import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ListsScreen } from '../screens/ListsScreen';
import { ListDetailScreen } from '../screens/ListDetailScreen';
import { ListSettingsScreen } from '../screens/ListSettingsScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SyncIssuesScreen } from '../screens/SyncIssuesScreen';
import { CreateListScreen } from '../screens/CreateListScreen';
import { ImportListScreen } from '../screens/ImportListScreen';
import { ArchivedListsScreen } from '../screens/ArchivedListsScreen';
import { DebugLogScreen } from '../screens/DebugLogScreen';
import { DeveloperScreen } from '../screens/DeveloperScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { useAuth } from '../../state/auth-store';
import type { RootStackParamList } from './types';
import { StyleSheet, View } from 'react-native';
import { IconButton } from '../components/IconButton';
import { ICONS } from '../icons';
import { SettingsButton } from '../components/SettingsButton';

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
            options={({ navigation }) => ({
              title: 'Lupira Tasks',
              headerRight: () => (
                <View style={styles.headerBtns}>
                  <IconButton name={ICONS.add} accessibilityLabel="New list" onPress={() => navigation.navigate('CreateList')} />
                  <SettingsButton />
                </View>
              ),
            })}
          />
          <Stack.Screen
            name="ListDetail"
            component={ListDetailScreen}
            options={({ navigation, route }) => ({
              title: route.params.name,
              headerRight: () => (
                <IconButton
                  name={ICONS.settings}
                  accessibilityLabel="List settings"
                  onPress={() => navigation.navigate('ListSettings', { listId: route.params.listId, name: route.params.name })}
                />
              ),
            })}
          />
          <Stack.Screen name="ListSettings" component={ListSettingsScreen} options={{ title: 'List settings' }} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="SyncIssues" component={SyncIssuesScreen} options={{ title: 'Sync issues' }} />
          <Stack.Screen name="CreateList" component={CreateListScreen} options={{ title: 'New list', presentation: 'modal' }} />
          <Stack.Screen name="ImportList" component={ImportListScreen} options={{ title: 'Import list', presentation: 'modal' }} />
          <Stack.Screen name="ArchivedLists" component={ArchivedListsScreen} options={{ title: 'Archived lists' }} />
          <Stack.Screen name="DebugLog" component={DebugLogScreen} options={{ title: 'Debug log' }} />
          <Stack.Screen name="Developer" component={DeveloperScreen} options={{ title: 'Developer' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
