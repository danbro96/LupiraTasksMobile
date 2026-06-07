import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { DebugPanel } from '../debug/DebugPanel';
import { toast } from '../components/Toast';
import { useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { enqueue } from '../offline/outbox';
import { syncAll } from '../offline/sync';
import { newId, stamp } from '../offline/ops';
import { logDebug } from '../debug/log';

export function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lists } = useLists();
  const opStatus = useOutboxStatus();
  const [name, setName] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try { await syncAll(); } catch { toast('Sync failed'); } finally { setRefreshing(false); }
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
        <TextInput
          style={styles.input}
          placeholder="New list…"
          value={name}
          onChangeText={setName}
          onSubmitEditing={addList}
          returnKeyType="done"
        />
        <Pressable style={styles.addBtn} onPress={addList}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <FlatList
        data={lists}
        keyExtractor={l => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No lists yet — add one above.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => nav.navigate('ListDetail', { listId: item.id, name: item.name })}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <View style={styles.rowRight}>
              <SyncDot status={opStatus.get(item.id)} />
              <Text style={styles.rowMeta}>{item.kind}</Text>
            </View>
          </Pressable>
        )}
      />
      <DebugPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#fff' },
  addRow: { flexDirection: 'row', padding: 12, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d4d8e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  addBtn: { backgroundColor: '#1d3a5f', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  row: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e3e6ec', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 17, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowMeta: { fontSize: 12, color: '#8a909c' },
  empty: { textAlign: 'center', color: '#8a909c', marginTop: 40 },
});
