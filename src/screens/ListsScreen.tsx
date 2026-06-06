import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { SyncBanner } from '../components/SyncBanner';
import { useLists } from '../offline/useMirror';
import { enqueue } from '../offline/outbox';
import { newId, stamp } from '../offline/ops';

export function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lists } = useLists();
  const [name, setName] = useState('');

  async function addList() {
    const n = name.trim();
    if (!n) return;
    setName('');
    await enqueue({ ...stamp(), kind: 'list.create', listId: newId(), name: n, listKind: ListKind.Todo, color: null });
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
        ListEmptyComponent={<Text style={styles.empty}>No lists yet — add one above.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => nav.navigate('ListDetail', { listId: item.id, name: item.name })}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.kind}</Text>
          </Pressable>
        )}
      />
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
  rowTitle: { fontSize: 17 },
  rowMeta: { fontSize: 12, color: '#8a909c' },
  empty: { textAlign: 'center', color: '#8a909c', marginTop: 40 },
});
