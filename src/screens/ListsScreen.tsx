import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { DebugPanel } from '../debug/DebugPanel';
import { toast } from '../components/Toast';
import { useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { useSyncStatus } from '../offline/syncStatus';
import { enqueue } from '../offline/outbox';
import { syncAll } from '../offline/sync';
import { newId, stamp } from '../offline/ops';
import { logDebug } from '../debug/log';
import { colors, radii, spacing, type } from '../theme';

export function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lists } = useLists();
  const opStatus = useOutboxStatus();
  const firstSyncDone = useSyncStatus(s => s.firstSyncDone);
  const [name, setName] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await syncAll();
    } catch {
      toast('Sync failed');
    } finally {
      setRefreshing(false);
    }
  }

  async function addList() {
    const n = name.trim();
    if (!n) return;
    setName('');
    logDebug('addList', n);
    try {
      await enqueue({ ...stamp(), kind: 'list.create', listId: newId(), name: n, listKind: ListKind.Todo, color: null });
    } catch (e) {
      toast("Couldn't add list");
      logDebug('addList:error', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <View style={styles.addRow}>
        <TextField
          placeholder="New list…"
          value={name}
          onChangeText={setName}
          onSubmitEditing={addList}
          returnKeyType="done"
          accessibilityLabel="New list name"
        />
        <Button title="Add" onPress={addList} disabled={!name.trim()} style={styles.addBtn} />
      </View>
      <FlatList
        data={lists}
        keyExtractor={l => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          firstSyncDone ? (
            <Text style={styles.empty}>No lists yet — add one above.</Text>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.textSubtle} />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => nav.navigate('ListDetail', { listId: item.id, name: item.name })}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            accessibilityHint="Opens the list"
          >
            <View style={[styles.colorDot, item.color ? { backgroundColor: item.color } : styles.colorDotNone]} />
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            <View style={styles.rowRight}>
              <SyncDot status={opStatus.get(item.id)} />
              <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
            </View>
          </Pressable>
        )}
      />
      <DebugPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  addRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  addBtn: { paddingVertical: 0 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: { width: 12, height: 12, borderRadius: radii.sm, marginRight: spacing.md },
  colorDotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  rowTitle: { ...type.bodyLg, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.textSubtle, marginTop: 40 },
  loading: { marginTop: 40 },
});
