import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ReorderableList, { useReorderableDrag, useIsActive, reorderItems } from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import { LinearTransition, runOnJS } from 'react-native-reanimated';
import type { ListDto } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { DebugPanel } from '../components/DebugPanel';
import { hapticImpact } from '../../feedback/haptics';
import { toastError } from '../../feedback/toast';
import { useLists } from '../hooks/useMirror';
import { useOutboxStatus, type OpStatus } from '../hooks/useOutboxStatus';
import { useSyncStatus } from '../../sync/syncStatus';
import { syncAll } from '../../sync/sync';
import { enqueueMany } from '../../sync/outbox';
import { planListReorder } from '../../domain/listOrder';
import { stamp } from '../../domain/ops';
import { radii, spacing, useColors, type Palette } from '../theme';

interface RowProps {
  list: ListDto;
  status?: OpStatus;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  onOpen: (list: ListDto) => void;
}

const ListRow = memo(function ListRow({ list, status, styles, palette, onOpen }: RowProps) {
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  return (
    <Pressable
      style={[styles.row, isActive && styles.rowActive]}
      onPress={() => onOpen(list)}
      onLongPress={drag}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={list.name}
      accessibilityHint="Opens the list. Long-press to reorder."
    >
      <View style={[styles.colorDot, list.color ? { backgroundColor: list.color } : styles.colorDotNone]} />
      <Text variant="bodyLarge" style={styles.rowTitle} numberOfLines={1}>{list.name}</Text>
      <View style={styles.rowRight}>
        <SyncDot status={status} />
        <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textDisabled} />
      </View>
    </Pressable>
  );
});

export function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lists } = useLists();
  const opStatus = useOutboxStatus();
  const firstSyncDone = useSyncStatus(s => s.firstSyncDone);
  const [refreshing, setRefreshing] = useState(false);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  // The background poll must not re-sort under the finger mid-drag (same freeze as ListDetailScreen).
  const [dragging, setDragging] = useState(false);
  // The list moves the row on drop, but our order only changes once the enqueued op reaches the
  // mirror. Keep rendering the reordered snapshot until it does, or the cells lose their slots.
  const [settling, setSettling] = useState(false);
  const frozen = useRef(lists);
  if (!dragging && !settling) frozen.current = lists;
  const data = dragging || settling ? frozen.current : lists;
  useEffect(() => setSettling(false), [lists]);

  const dragGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(520), []);

  const openList = useCallback((l: ListDto) => {
    nav.navigate('ListDetail', { listId: l.id, name: l.name });
  }, [nav]);

  async function refresh() {
    setRefreshing(true);
    try {
      await syncAll();
    } catch {
      toastError('Sync failed');
    } finally {
      setRefreshing(false);
    }
  }

  function onReorder({ from, to }: { from: number; to: number }) {
    setDragging(false);
    // Indices refer to the frozen array the list was rendered with during the drag.
    const targets = planListReorder(frozen.current, from, to);
    if (targets.length === 0) return;
    frozen.current = reorderItems(frozen.current, from, to);
    setSettling(true);
    // One transaction, one mirror bump — the first drag materializes every list's key at once.
    void enqueueMany(targets.map(t => ({ ...stamp(), kind: 'list.reorder' as const, ...t })))
      .catch(() => toastError("Couldn't reorder lists"));
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <ReorderableList
        data={data}
        keyExtractor={l => l?.id ?? ''}
        panGesture={dragGesture}
        shouldUpdateActiveItem
        itemLayoutAnimation={LinearTransition.duration(200)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onDragStart={() => {
          'worklet';
          runOnJS(hapticImpact)(); // "pickup" thunk when a row is grabbed to reorder
          runOnJS(setDragging)(true);
        }}
        onDragEnd={() => {
          'worklet';
          runOnJS(setDragging)(false);
        }}
        onReorder={onReorder}
        ListEmptyComponent={
          firstSyncDone ? (
            <Text style={styles.empty}>No lists yet — tap + to add one.</Text>
          ) : (
            <ActivityIndicator style={styles.loading} color={c.textSubtle} />
          )
        }
        renderItem={({ item }) =>
          !item ? null : (
          <ListRow
            list={item}
            status={opStatus.get(item.id)}
            styles={styles}
            palette={c}
            onOpen={openList}
          />
          )
        }
      />
      <DebugPanel />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    row: {
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg, // opaque so a picked-up row doesn't show the rows it passes over
    },
    rowActive: { backgroundColor: c.surface, borderBottomColor: 'transparent' },
    colorDot: { width: 12, height: 12, borderRadius: radii.sm, marginRight: spacing.md },
    colorDotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
    rowTitle: { flex: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
