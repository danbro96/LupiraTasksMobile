import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { toast } from '../../feedback/toast';
import { listParked, retryParked, discardParked, type ParkedOp } from '../../sync/outbox';
import { useSyncStatus } from '../../sync/syncStatus';
import type { ClientOp } from '../../domain/ops';
import { HIT_SLOP, makeType, radii, spacing, useColors, type Palette } from '../theme';

// Human label per op kind. A Record over the union forces every new op kind to get a label.
const OP_LABELS: Record<ClientOp['kind'], string> = {
  'item.create': 'Add task',
  'item.rename': 'Rename task',
  'item.notes': 'Edit notes',
  'item.assign': 'Assign task',
  'item.due': 'Set due date',
  'item.quantity': 'Set quantity',
  'item.tagAdd': 'Add tag',
  'item.tagRemove': 'Remove tag',
  'item.complete': 'Complete task',
  'item.reopen': 'Reopen task',
  'item.move': 'Move task',
  'item.delete': 'Delete task',
  'list.create': 'Create list',
  'list.rename': 'Rename list',
  'list.recolor': 'Change list color',
  'list.memberAdd': 'Add member',
  'list.memberRoleChange': 'Change member role',
  'list.memberRemove': 'Remove member',
  'list.leave': 'Leave list',
  'list.delete': 'Delete list',
  'list.archive': 'Archive list',
  'list.restore': 'Restore list',
};

/**
 * Recovery view for changes the server rejected (parked outbox ops). Reached by tapping the
 * "N changes failed to sync" banner. The user can retry them all (e.g. after the conflicting
 * state resolves) or discard ones that can never succeed. Re-reads whenever the failed count
 * or mirror changes, so it self-updates as a retry drains.
 */
export function SyncIssuesScreen() {
  const failed = useSyncStatus(s => s.failed);
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [rows, setRows] = useState<ParkedOp[]>([]);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const reload = useCallback(() => {
    void listParked().then(setRows);
  }, []);
  useEffect(reload, [reload, failed, rev]);

  function onRetryAll() {
    void retryParked();
    toast('Retrying failed changes…');
  }

  function onDiscard(row: ParkedOp) {
    void discardParked(row.seq);
    toast('Change discarded');
  }

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="checkmark-circle-outline" size={48} color={c.textDisabled} />
        <Text style={styles.emptyText}>All changes are synced.</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlatList
        data={rows}
        keyExtractor={r => String(r.seq)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerText}>
              These changes couldn&apos;t be saved to the server. Retry them, or discard ones you no longer want.
            </Text>
            <Button title="Retry all" onPress={onRetryAll} style={styles.retry} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.opLabel}>{OP_LABELS[item.op.kind]}</Text>
              {item.lastError ? <Text style={styles.error} numberOfLines={2}>{item.lastError}</Text> : null}
            </View>
            <Pressable
              onPress={() => onDiscard(item)}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Discard ${OP_LABELS[item.op.kind]}`}
              style={({ pressed }) => [styles.discard, pressed && styles.pressed]}
            >
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    list: { padding: spacing.lg },
    header: { gap: spacing.md, marginBottom: spacing.lg },
    headerText: { ...t.small },
    opLabel: { ...t.body },
    retry: { alignSelf: 'stretch' },
    sep: { height: 1, backgroundColor: c.divider },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
    rowText: { flex: 1, gap: spacing.xs },
    error: { ...t.hint, color: c.danger },
    discard: { borderWidth: 1, borderColor: c.danger, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    discardText: { ...t.button, color: c.danger },
    pressed: { opacity: 0.6 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: c.bg },
    emptyText: { ...t.body, color: c.textMuted },
  });
};
