import { useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { generateKeyBetween } from 'fractional-indexing';
import type { RootStackParamList } from '../navigation/types';
import type { ItemState } from '../offline/itemState';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { enqueue } from '../offline/outbox';
import { pullList } from '../offline/sync';
import { newId, stamp } from '../offline/ops';

export function ListDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { items } = useItems(listId);
  const { lists } = useLists();
  const color = lists.find(l => l.id === listId)?.color ?? null;
  const opStatus = useOutboxStatus();
  const [title, setTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Gear button → per-list settings (name, color, members).
  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <Pressable onPress={() => nav.navigate('ListSettings', { listId, name: params.name })} hitSlop={8}>
          <Text style={{ fontSize: 20 }}>⚙</Text>
        </Pressable>
      ),
    });
  }, [nav, listId, params.name]);

  // Refresh this list from the server when opened (and on pull-to-refresh).
  useEffect(() => { void pullList(listId); }, [listId]);

  async function refresh() {
    setRefreshing(true);
    try { await pullList(listId); } catch { toast('Sync failed'); } finally { setRefreshing(false); }
  }

  const active = items.filter(i => !i.completed);
  const done = items.filter(i => i.completed);

  async function addItem() {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    const lastKey = active.length ? active[active.length - 1].sortOrder : null;
    const sortOrder = generateKeyBetween(lastKey, null);
    try {
      await enqueue({ ...stamp(), kind: 'item.create', listId, itemId: newId(), title: t, sortOrder, parentItemId: null });
    } catch {
      toast("Couldn't add item");
    }
  }

  async function toggle(it: ItemState) {
    try {
      await enqueue({ ...stamp(), kind: it.completed ? 'item.reopen' : 'item.complete', listId, itemId: it.id });
    } catch {
      toast("Couldn't update item");
    }
  }

  async function remove(it: ItemState) {
    try {
      await enqueue({ ...stamp(), kind: 'item.delete', listId, itemId: it.id });
    } catch {
      toast("Couldn't delete item");
    }
  }

  const sections = [
    { title: 'To do', data: active },
    ...(done.length ? [{ title: 'Done', data: done }] : []),
  ];

  return (
    <View style={styles.fill}>
      {color ? <View style={[styles.colorStripe, { backgroundColor: color }]} /> : null}
      <SyncBanner />
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add item…"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <Pressable style={styles.addBtn} onPress={addItem}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No items yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => toggle(item)} onLongPress={() => remove(item)}>
            <Text style={styles.check}>{item.completed ? '☑' : '☐'}</Text>
            <Text style={[styles.itemTitle, item.completed && styles.itemDone]}>{item.title}</Text>
            <SyncDot status={opStatus.get(item.id)} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#fff' },
  colorStripe: { height: 5 },
  addRow: { flexDirection: 'row', padding: 12, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d4d8e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  addBtn: { backgroundColor: '#1d3a5f', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 6, fontSize: 12, fontWeight: '700', color: '#8a909c', backgroundColor: '#f5f6f8' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e3e6ec' },
  check: { fontSize: 20, width: 24 },
  itemTitle: { fontSize: 17, flex: 1 },
  itemDone: { color: '#9aa0ac', textDecorationLine: 'line-through' },
  empty: { textAlign: 'center', color: '#8a909c', marginTop: 40 },
});
