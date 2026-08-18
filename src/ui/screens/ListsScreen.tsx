import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import ReorderableList, { useReorderableDrag, useIsActive } from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import { LinearTransition, runOnJS } from 'react-native-reanimated';
import type { ListResponse } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { IconButton } from '../components/IconButton';
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
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

interface RowProps {
  list: ListResponse;
  status?: OpStatus;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  onOpen: (list: ListResponse) => void;
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
      <Text style={styles.rowTitle} numberOfLines={1}>{list.name}</Text>
      <View style={styles.rowRight}>
        <SyncDot status={status} />
        <Ionicons name="chevron-forward" size={18} color={palette.textDisabled} />
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
  const frozen = useRef(lists);
  if (!dragging) frozen.current = lists;
  const data = dragging ? frozen.current : lists;

  const dragGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(520), []);

  const openList = useCallback((l: ListResponse) => {
    nav.navigate('ListDetail', { listId: l.id, name: l.name });
  }, [nav]);

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <View style={styles.headerBtns}>
          <IconButton name="plus" accessibilityLabel="New list" onPress={() => nav.navigate('CreateList')} />
          <IconButton name="account-circle-outline" accessibilityLabel="Account" onPress={() => nav.navigate('Account')} />
        </View>
      ),
    });
  }, [nav, styles]);

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
    // One transaction, one mirror bump — the first drag materializes every list's key at once.
    void enqueueMany(targets.map(t => ({ ...stamp(), kind: 'list.reorder' as const, ...t })))
      .catch(() => toastError("Couldn't reorder lists"));
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <ReorderableList
        data={data}
        keyExtractor={l => l.id}
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
        renderItem={({ item }) => (
          <ListRow
            list={item}
            status={opStatus.get(item.id)}
            styles={styles}
            palette={c}
            onOpen={openList}
          />
        )}
      />
      <DebugPanel />
    </View>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
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
    rowTitle: { ...t.bodyLg, flex: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
