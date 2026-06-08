import { useMemo } from 'react';
import { FlatList, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useDebugLog, clearDebugLog } from '../../debug/log';
import { makeType, spacing, useColors, type Palette } from '../theme';

/**
 * On-device view of the shared debug buffer (the same trace the dev-only floating DebugPanel
 * shows). Reachable from Account when "Enable debug" is on, so it works in production builds —
 * unlike DebugPanel, which is __DEV__-gated. Newest-first; Share exports the whole buffer.
 */
export function DebugLogScreen() {
  const entries = useDebugLog(s => s.entries);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const rows = useMemo(() => [...entries].reverse(), [entries]);

  function onShare() {
    void Share.share({
      message: entries.map(e => `${e.t} ${e.stage} ${e.detail ?? ''}`.trim()).join('\n'),
    });
  }

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Text style={styles.count}>{entries.length} events</Text>
        <View style={styles.actions}>
          <Button title="Share" variant="secondary" onPress={onShare} />
          <Button title="Clear" variant="secondary" onPress={() => clearDebugLog()} />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(e, i) => `${e.t}-${i}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No events yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.stage} selectable>
              {item.stage}{item.detail ? `  ${item.detail}` : ''}
            </Text>
            <Text style={styles.ts}>{item.t.slice(11, 23)}</Text>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    count: { ...t.small },
    actions: { flexDirection: 'row', gap: spacing.sm },
    list: { padding: spacing.lg },
    row: { paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    stage: { fontFamily: 'monospace', fontSize: 11, color: c.text },
    ts: { fontFamily: 'monospace', fontSize: 10, color: c.textMuted, marginTop: 1 },
    empty: { ...t.body, color: c.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  });
};
