import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';
import { IconButton } from '../components/IconButton';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { DebugPanel } from '../debug/DebugPanel';
import { toast } from '../components/Toast';
import { useLists } from '../offline/useMirror';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { useSyncStatus } from '../offline/syncStatus';
import { syncAll } from '../offline/sync';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

export function ListsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lists } = useLists();
  const opStatus = useOutboxStatus();
  const firstSyncDone = useSyncStatus(s => s.firstSyncDone);
  const [refreshing, setRefreshing] = useState(false);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <View style={styles.headerBtns}>
          <IconButton name="add" accessibilityLabel="New list" onPress={() => nav.navigate('CreateList')} />
          <IconButton name="person-circle-outline" accessibilityLabel="Account" onPress={() => nav.navigate('Account')} />
        </View>
      ),
    });
  }, [nav]);

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

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <FlatList
        data={lists}
        keyExtractor={l => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          firstSyncDone ? (
            <Text style={styles.empty}>No lists yet — tap + to add one.</Text>
          ) : (
            <ActivityIndicator style={styles.loading} color={c.textSubtle} />
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
              <Ionicons name="chevron-forward" size={18} color={c.textDisabled} />
            </View>
          </Pressable>
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
    },
    colorDot: { width: 12, height: 12, borderRadius: radii.sm, marginRight: spacing.md },
    colorDotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
    rowTitle: { ...t.bodyLg, flex: 1 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
