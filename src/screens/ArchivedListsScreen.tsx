import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { SyncBanner } from '../components/SyncBanner';
import { toast } from '../components/Toast';
import { useArchivedLists } from '../offline/useMirror';
import { enqueue } from '../offline/outbox';
import { stamp } from '../offline/ops';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

export function ArchivedListsScreen() {
  const { lists } = useArchivedLists();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  function restore(listId: string) {
    void enqueue({ ...stamp(), kind: 'list.restore', listId }).catch(() => toast("Couldn't restore list"));
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <FlatList
        data={lists}
        keyExtractor={l => l.id}
        ListEmptyComponent={<Text style={styles.empty}>No archived lists.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.colorDot, item.color ? { backgroundColor: item.color } : styles.colorDotNone]} />
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            <Button title="Restore" variant="secondary" onPress={() => restore(item.id)} style={styles.restore} />
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    colorDot: { width: 12, height: 12, borderRadius: radii.sm, marginRight: spacing.md },
    colorDotNone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
    rowTitle: { ...t.bodyLg, flex: 1 },
    restore: { paddingVertical: 6, paddingHorizontal: spacing.md },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
  });
};
