import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { generateKeyBetween } from 'fractional-indexing';
import ReorderableList, { useReorderableDrag, useIsActive } from 'react-native-reorderable-list';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import type { ItemState } from '../offline/itemState';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import type { OpStatus } from '../offline/useOutboxStatus';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { useMyRole, canEditWithRole } from '../offline/useMyRole';
import { usePendingDeletes, requestItemDeleteMany } from '../offline/pendingDeletes';
import { usePrefs } from '../store/prefs-store';
import { buildVisibleRows, collapseDescendants, descendantIds, siblingReorder, type VisibleRow } from '../offline/itemTree';
import { enqueue } from '../offline/outbox';
import { pullList } from '../offline/sync';
import { newId, stamp } from '../offline/ops';
import { formatDue } from '../util/dueDate';
import { makeType, spacing, useColors, type Palette } from '../theme';

const INDENT = spacing.lg; // left inset per nesting level

/** "2 kg"-style quantity label for shopping items, or null when there's nothing to show. */
function qtyLabel(it: ItemState): string | null {
  if (it.quantity == null && !it.unit) return null;
  const q = it.quantity != null ? String(it.quantity) : '';
  return `${q}${q && it.unit ? ' ' : ''}${it.unit ?? ''}`.trim() || null;
}

interface RowProps {
  row: VisibleRow;
  canEdit: boolean;
  isShopping: boolean;
  status?: OpStatus;
  expanded: boolean;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  onToggle: (it: ItemState) => void;
  onOpen: (it: ItemState) => void;
  onToggleExpand: (id: string) => void;
  onDelete: (it: ItemState) => void;
}

function TaskRow({ row, canEdit, isShopping, status, expanded, styles, palette, onToggle, onOpen, onToggleExpand, onDelete }: RowProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();
  const { item, depth, hasChildren } = row;
  const due = formatDue(item.dueAt);
  const qty = isShopping ? qtyLabel(item) : null;

  const inner = (
    <Pressable
      style={[styles.row, { paddingLeft: spacing.lg + depth * INDENT }, isActive && styles.rowActive]}
      onPress={() => onOpen(item)}
      onLongPress={canEdit ? drag : undefined}
      delayLongPress={250}
      accessibilityRole="button"
      accessibilityLabel={`${qty ? qty + ' ' : ''}${item.title}${due ? `, due ${due.label}` : ''}`}
      accessibilityHint="Opens task details. Long-press to reorder."
    >
      <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => onToggle(item)} />
      <View style={styles.rowBody}>
        <Text style={[styles.itemTitle, item.completed && styles.itemDone]} numberOfLines={2}>
          {qty ? <Text style={styles.qty}>{qty}  </Text> : null}
          {item.title}
        </Text>
        {(due || item.assignedTo) && !item.completed ? (
          <View style={styles.metaRow}>
            {due ? <Text style={[styles.meta, due.overdue && styles.overdue]}>{due.label}</Text> : null}
            {item.assignedTo ? <Text style={styles.meta} numberOfLines={1}>{item.assignedTo}</Text> : null}
          </View>
        ) : null}
      </View>
      <SyncDot status={status} />
      {hasChildren ? (
        <IconButton
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          accessibilityLabel={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
          color={palette.textSubtle}
          size={20}
          onPress={() => onToggleExpand(item.id)}
        />
      ) : null}
    </Pressable>
  );

  if (!canEdit) return inner;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.swipeDelete}>
          <Ionicons name="trash" size={22} color="#fff" />
        </View>
      )}
      onSwipeableOpen={direction => {
        if (direction === 'right') onDelete(item);
      }}
    >
      {inner}
    </ReanimatedSwipeable>
  );
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
  const hideCompleted = usePrefs(s => s.hideCompleted[listId] ?? false);
  const [title, setTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Pull on focus (not just mount): native-stack keeps this screen mounted when TaskDetail /
  // ListSettings are pushed on top, so a mount-only effect would leave tasks stale on return.
  useFocusEffect(
    useCallback(() => {
      void pullList(listId).finally(() => setPulled(true));
    }, [listId]),
  );

  const visibleItems = useMemo(() => items.filter(i => !pendingDeletes.has(i.id)), [items, pendingDeletes]);
  const rows = useMemo(() => buildVisibleRows(visibleItems, expanded, hideCompleted), [visibleItems, expanded, hideCompleted]);

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

  async function addItem() {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    // New tasks from the list view are always top-level; append after the last root.
    const topKeys = items.filter(i => i.parentItemId == null).map(i => i.sortOrder).sort();
    const sortOrder = generateKeyBetween(topKeys.length ? topKeys[topKeys.length - 1] : null, null);
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

  function toggleExpand(id: string) {
    setExpanded(prev => (prev.has(id) ? collapseDescendants(prev, id, items) : new Set(prev).add(id)));
  }

  function onDelete(it: ItemState) {
    requestItemDeleteMany(listId, [it.id, ...descendantIds(items, it.id)]);
  }

  function onReorder({ from, to }: { from: number; to: number }) {
    if (from === to) return;
    const draggedId = rows[from]?.item.id;
    if (!draggedId) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const target = siblingReorder(next, draggedId);
    if (target) {
      void enqueue({ ...stamp(), kind: 'item.move', listId, itemId: draggedId, ...target }).catch(() => toast("Couldn't move item"));
    }
  }

  return (
    <View style={styles.fill}>
      {color ? <View style={[styles.colorStripe, { backgroundColor: color }]} /> : null}
      <SyncBanner />
      {canEdit ? (
        <View style={styles.addRow}>
          <TextField
            placeholder="Add task…"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={addItem}
            returnKeyType="done"
            accessibilityLabel="New task title"
          />
          <Button title="Add" onPress={addItem} disabled={!title.trim()} style={styles.addBtn} />
        </View>
      ) : (
        <Text style={styles.readonly}>You have view-only access to this list.</Text>
      )}
      <ReorderableList
        data={rows}
        keyExtractor={r => r.item.id}
        dragEnabled={canEdit}
        shouldUpdateActiveItem
        onReorder={onReorder}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          pulled ? (
            <Text style={styles.empty}>No tasks yet.</Text>
          ) : (
            <ActivityIndicator style={styles.loading} color={c.textSubtle} />
          )
        }
        renderItem={({ item: row }) => (
          <TaskRow
            row={row}
            canEdit={canEdit}
            isShopping={isShopping}
            status={opStatus.get(row.item.id)}
            expanded={expanded.has(row.item.id)}
            styles={styles}
            palette={c}
            onToggle={toggle}
            onOpen={it => nav.navigate('TaskDetail', { listId, itemId: it.id })}
            onToggleExpand={toggleExpand}
            onDelete={onDelete}
          />
        )}
      />
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
      paddingRight: spacing.lg,
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    rowActive: { backgroundColor: c.surface, borderBottomColor: 'transparent' },
    rowBody: { flex: 1 },
    itemTitle: { ...t.bodyLg },
    itemDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    qty: { color: c.textMuted, fontWeight: '700' },
    metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
    meta: { ...t.hint, color: c.textMuted, flexShrink: 1 },
    overdue: { color: c.danger, fontWeight: '600' },
    swipeDelete: { width: 72, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
