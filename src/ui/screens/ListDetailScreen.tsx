import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { generateKeyBetween } from 'fractional-indexing';
import ReorderableList, { useReorderableDrag, useIsActive } from 'react-native-reorderable-list';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, runOnJS, SlideOutLeft, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { hapticImpact, hapticSuccess } from '../../feedback/haptics';
import { ListKind } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import type { ItemState } from '../../domain/itemState';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import type { OpStatus } from '../hooks/useOutboxStatus';
import { toast, toastError } from '../../feedback/toast';
import { useItems, useLists } from '../hooks/useMirror';
import { useOutboxStatus } from '../hooks/useOutboxStatus';
import { useMyRole, canEditWithRole } from '../hooks/useMyRole';
import { usePendingDeletes, requestItemDeleteMany } from '../state/pendingDeletes';
import { usePrefs } from '../../state/prefs-store';
import { buildVisibleRows, collapseDescendants, descendantIds, siblingReorder, type VisibleRow } from '../../domain/itemTree';
import { enqueue } from '../../sync/outbox';
import { pullList } from '../../sync/sync';
import { newId, stamp } from '../../domain/ops';
import { formatDue } from '../../domain/dueDate';
import { makeType, spacing, useColors, type Palette } from '../theme';

const INDENT = spacing.lg; // left inset per nesting level
const SWIPE_DELETE_THRESHOLD = -80; // swipe left past this (px) and release to delete

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
  const translateX = useSharedValue(0);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // Red delete backdrop is invisible until the row is actually swiped — so it never shows at rest
  // or while the row is picked up for reordering.
  const deleteBgStyle = useAnimatedStyle(() => ({ opacity: translateX.value < -1 ? 1 : 0 }));
  const { item, depth, hasChildren } = row;
  const due = formatDue(item.dueAt);
  const qty = isShopping ? qtyLabel(item) : null;

  const inner = (
    <Pressable
      style={[styles.row, { paddingLeft: spacing.lg + depth * INDENT }, isActive && styles.rowActive]}
      onPress={() => onOpen(item)}
      onLongPress={canEdit ? drag : undefined}
      delayLongPress={500}
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

  // Swipe the row left and release past the threshold to delete; otherwise it springs back.
  // A custom Pan (instead of Swipeable's open-callback, which doesn't fire reliably here) lets us
  // own the release handler and call onDelete via runOnJS. activeOffsetX claims only leftward drags;
  // failOffsetY yields vertical gestures to scroll. The reorder drag is gated behind a long-press
  // (list `panGesture`, below) so it doesn't steal these quick horizontal swipes.
  const swipe = Gesture.Pan()
    .activeOffsetX(-15)
    .failOffsetY([-12, 12])
    .onUpdate(e => {
      translateX.value = Math.min(0, e.translationX);
    })
    .onEnd(e => {
      if (e.translationX < SWIPE_DELETE_THRESHOLD) {
        // Remove it — the row's `exiting` animation slides it the rest of the way out and the
        // neighbors close the gap via the list's itemLayoutAnimation.
        runOnJS(onDelete)(item);
      } else {
        translateX.value = withSpring(0);
      }
    });

  return (
    <View style={styles.swipeContainer}>
      <Animated.View style={[styles.swipeDelete, deleteBgStyle]} pointerEvents="none">
        <Ionicons name="trash" size={22} color="#fff" />
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={rowStyle} exiting={SlideOutLeft.duration(180)}>{inner}</Animated.View>
      </GestureDetector>
    </View>
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
  // Gate the reorder drag behind a long-press so it doesn't claim the quick horizontal swipes used
  // for swipe-to-delete (slightly longer than the row's 500ms delayLongPress, per the lib's guidance).
  const dragGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(520), []);

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
      toastError('Sync failed');
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
      toastError("Couldn't add item");
    }
  }

  async function toggle(it: ItemState) {
    if (!it.completed) hapticSuccess(); // satisfying tick when checking a task off
    try {
      await enqueue({ ...stamp(), kind: it.completed ? 'item.reopen' : 'item.complete', listId, itemId: it.id });
    } catch {
      toastError("Couldn't update item");
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => (prev.has(id) ? collapseDescendants(prev, id, items) : new Set(prev).add(id)));
  }

  function onDelete(it: ItemState) {
    hapticImpact();
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
      void enqueue({ ...stamp(), kind: 'item.move', listId, itemId: draggedId, ...target }).catch(() => toastError("Couldn't move item"));
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
        panGesture={dragGesture}
        shouldUpdateActiveItem
        itemLayoutAnimation={LinearTransition.duration(200)}
        onDragStart={() => {
          'worklet';
          runOnJS(hapticImpact)(); // "pickup" thunk when a row is grabbed to reorder
        }}
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
    swipeContainer: { justifyContent: 'center' },
    swipeDelete: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: c.danger,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingRight: 24,
    },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
