import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { generateKeyBetween } from 'fractional-indexing';
import type { RootStackParamList } from '../navigation/types';
import type { ItemState } from '../offline/itemState';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { useMyRole, canEditWithRole } from '../offline/useMyRole';
import { usePendingDeletes, requestItemDelete } from '../offline/pendingDeletes';
import { enqueue } from '../offline/outbox';
import { pullList } from '../offline/sync';
import { newId, stamp } from '../offline/ops';
import { formatDue } from '../util/dueDate';
import { colors, spacing, type } from '../theme';

export function ListDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { items } = useItems(listId);
  const { lists } = useLists();
  const color = lists.find(l => l.id === listId)?.color ?? null;
  const opStatus = useOutboxStatus();
  const pendingDeletes = usePendingDeletes();
  const canEdit = canEditWithRole(useMyRole(listId));
  const [title, setTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pulled, setPulled] = useState(false);

  // Gear button → per-list settings (name, color, members).
  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <IconButton
          name="settings-outline"
          accessibilityLabel="List settings"
          onPress={() => nav.navigate('ListSettings', { listId, name: params.name })}
        />
      ),
    });
  }, [nav, listId, params.name]);

  // Refresh this list from the server when opened (and on pull-to-refresh).
  useEffect(() => {
    void pullList(listId).finally(() => setPulled(true));
  }, [listId]);

  async function refresh() {
    setRefreshing(true);
    try {
      await pullList(listId);
    } catch {
      toast('Sync failed');
    } finally {
      setRefreshing(false);
    }
  }

  const visible = items.filter(i => !pendingDeletes.has(i.id));
  const active = visible.filter(i => !i.completed);
  const done = visible.filter(i => i.completed);

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

  const sections = [
    { title: 'To do', data: active },
    ...(done.length ? [{ title: 'Done', data: done }] : []),
  ];

  return (
    <View style={styles.fill}>
      {color ? <View style={[styles.colorStripe, { backgroundColor: color }]} /> : null}
      <SyncBanner />
      {canEdit ? (
        <View style={styles.addRow}>
          <TextField
            placeholder="Add item…"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={addItem}
            returnKeyType="done"
            accessibilityLabel="New item title"
          />
          <Button title="Add" onPress={addItem} disabled={!title.trim()} style={styles.addBtn} />
        </View>
      ) : (
        <Text style={styles.readonly}>You have view-only access to this list.</Text>
      )}
      <SectionList
        sections={sections}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        ListEmptyComponent={
          pulled ? (
            <Text style={styles.empty}>No items yet.</Text>
          ) : (
            <ActivityIndicator style={styles.loading} color={colors.textSubtle} />
          )
        }
        renderItem={({ item }) => {
          const due = formatDue(item.dueAt);
          return (
            <Pressable
              style={styles.row}
              onPress={() => nav.navigate('TaskDetail', { listId, itemId: item.id })}
              onLongPress={canEdit ? () => requestItemDelete(listId, item.id) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${due ? `, due ${due.label}` : ''}`}
              accessibilityHint="Opens task details"
            >
              <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => void toggle(item)} />
              <View style={styles.rowBody}>
                <Text style={[styles.itemTitle, item.completed && styles.itemDone]} numberOfLines={2}>
                  {item.title}
                </Text>
                {(due || item.assignedTo) && !item.completed ? (
                  <View style={styles.metaRow}>
                    {due ? <Text style={[styles.meta, due.overdue && styles.overdue]}>{due.label}</Text> : null}
                    {item.assignedTo ? <Text style={styles.meta} numberOfLines={1}>{item.assignedTo}</Text> : null}
                  </View>
                ) : null}
              </View>
              <SyncDot status={opStatus.get(item.id)} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  colorStripe: { height: 5 },
  addRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
  addBtn: { paddingVertical: 0 },
  readonly: { ...type.small, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sectionHeader: {
    ...type.sectionLabel,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowBody: { flex: 1 },
  itemTitle: { ...type.bodyLg },
  itemDone: { color: colors.textDisabled, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  meta: { ...type.hint, color: colors.textMuted, flexShrink: 1 },
  overdue: { color: colors.danger, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textSubtle, marginTop: 40 },
  loading: { marginTop: 40 },
});
