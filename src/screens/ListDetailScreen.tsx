import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { generateKeyBetween } from 'fractional-indexing';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import type { ItemState } from '../offline/itemState';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { ActionMenu, type ActionItem } from '../components/ActionMenu';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { useMyRole, canEditWithRole } from '../offline/useMyRole';
import { usePendingDeletes, requestItemDelete } from '../offline/pendingDeletes';
import { enqueue } from '../offline/outbox';
import { pullList } from '../offline/sync';
import { newId, stamp } from '../offline/ops';
import { formatDue } from '../util/dueDate';
import { makeType, spacing, useColors, type Palette } from '../theme';

/** "2 kg"-style quantity label for shopping items, or null when there's nothing to show. */
function qtyLabel(it: ItemState): string | null {
  if (it.quantity == null && !it.unit) return null;
  const q = it.quantity != null ? String(it.quantity) : '';
  return `${q}${q && it.unit ? ' ' : ''}${it.unit ?? ''}`.trim() || null;
}

export function ListDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { items } = useItems(listId);
  const { lists } = useLists();
  const list = lists.find(l => l.id === listId);
  const color = list?.color ?? null;
  const isShopping = list?.kind === ListKind.Shopping;
  const opStatus = useOutboxStatus();
  const pendingDeletes = usePendingDeletes();
  const canEdit = canEditWithRole(useMyRole(listId));
  const [title, setTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [menuItem, setMenuItem] = useState<ItemState | null>(null);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

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

  // Reorder within the active section by inserting a fractional key between neighbors.
  function move(it: ItemState, dir: -1 | 1) {
    const i = active.findIndex(x => x.id === it.id);
    if (i < 0) return;
    let sortOrder: string;
    try {
      if (dir < 0) {
        if (i === 0) return;
        sortOrder = generateKeyBetween(active[i - 2]?.sortOrder ?? null, active[i - 1].sortOrder);
      } else {
        if (i >= active.length - 1) return;
        sortOrder = generateKeyBetween(active[i + 1].sortOrder, active[i + 2]?.sortOrder ?? null);
      }
    } catch {
      toast("Couldn't move item");
      return;
    }
    void enqueue({ ...stamp(), kind: 'item.move', listId, itemId: it.id, sortOrder, parentItemId: it.parentItemId }).catch(() =>
      toast("Couldn't move item"),
    );
  }

  const menuActions: ActionItem[] = (() => {
    if (!menuItem) return [];
    const acts: ActionItem[] = [];
    const i = active.findIndex(x => x.id === menuItem.id);
    if (i >= 0) {
      if (i > 0) acts.push({ label: 'Move up', onPress: () => move(menuItem, -1) });
      if (i < active.length - 1) acts.push({ label: 'Move down', onPress: () => move(menuItem, 1) });
    }
    acts.push({ label: 'Delete', destructive: true, onPress: () => requestItemDelete(listId, menuItem.id) });
    return acts;
  })();

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
            <ActivityIndicator style={styles.loading} color={c.textSubtle} />
          )
        }
        renderItem={({ item }) => {
          const due = formatDue(item.dueAt);
          const qty = isShopping ? qtyLabel(item) : null;
          return (
            <Pressable
              style={styles.row}
              onPress={() => nav.navigate('TaskDetail', { listId, itemId: item.id })}
              onLongPress={canEdit ? () => setMenuItem(item) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${qty ? qty + ' ' : ''}${item.title}${due ? `, due ${due.label}` : ''}`}
              accessibilityHint="Opens task details"
            >
              <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => void toggle(item)} />
              <View style={styles.rowBody}>
                <Text style={[styles.itemTitle, item.completed && styles.itemDone]} numberOfLines={2}>
                  {qty ? <Text style={styles.qty}>{qty}  </Text> : null}
                  {item.title}
                </Text>
                {(due || item.assignedTo) && !item.completed ? (
                  <View style={styles.metaRow}>
                    {due ? <Text style={[styles.meta, due.overdue && styles.overdue]}>{due.label}</Text> : null}
                    {item.assignedTo ? (
                      <Text style={styles.meta} numberOfLines={1}>{item.assignedTo}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <SyncDot status={opStatus.get(item.id)} />
            </Pressable>
          );
        }}
      />
      <ActionMenu visible={menuItem !== null} title={menuItem?.title} actions={menuActions} onClose={() => setMenuItem(null)} />
    </View>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    colorStripe: { height: 5 },
    addRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm },
    addBtn: { paddingVertical: 0 },
    readonly: { ...t.small, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    sectionHeader: {
      ...t.sectionLabel,
      paddingHorizontal: spacing.lg,
      paddingVertical: 6,
      backgroundColor: c.surface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    rowBody: { flex: 1 },
    itemTitle: { ...t.bodyLg },
    itemDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    qty: { color: c.textMuted, fontWeight: '700' },
    metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
    meta: { ...t.hint, color: c.textMuted, flexShrink: 1 },
    overdue: { color: c.danger, fontWeight: '600' },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
