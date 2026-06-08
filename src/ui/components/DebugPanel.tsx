import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebugLog, clearDebugLog } from '../../debug/log';

/** Collapsible on-device debug log (dev-only). Renders the shared debug buffer newest-first. */
export function DebugPanel() {
  const entries = useDebugLog(s => s.entries);
  const [show, setShow] = useState(false);
  const insets = useSafeAreaInsets();

  if (!__DEV__) return null;

  return (
    <View style={[styles.debug, { bottom: insets.bottom + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => setShow(s => !s)} hitSlop={8}>
          <Text style={styles.title}>Debug ({entries.length}) {show ? '▾' : '▸'}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              void Share.share({
                message: entries.map(e => `${e.t} ${e.stage} ${e.detail ?? ''}`.trim()).join('\n'),
              })
            }
            hitSlop={8}
          >
            <Text style={styles.action}>Share</Text>
          </Pressable>
          <Pressable onPress={() => clearDebugLog()} hitSlop={8}>
            <Text style={styles.action}>Clear</Text>
          </Pressable>
        </View>
      </View>
      {show && (
        <ScrollView style={styles.scroll}>
          {entries.length === 0 ? (
            <Text style={styles.lineMuted}>No events yet.</Text>
          ) : (
            [...entries].reverse().map((e, i) => (
              <Text key={`${e.t}-${i}`} style={styles.line} selectable>
                {e.stage}
                {e.detail ? `  ${e.detail}` : ''}
              </Text>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  debug: { position: 'absolute', left: 8, right: 8, maxHeight: 260, backgroundColor: '#0d1117', borderRadius: 8, padding: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { color: '#9aa0ac', fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 16 },
  action: { color: '#6ea8fe', fontSize: 12 },
  scroll: { maxHeight: 220 },
  line: { color: '#d4d8e0', fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
  lineMuted: { color: '#6e7686', fontSize: 11, fontStyle: 'italic' },
});
