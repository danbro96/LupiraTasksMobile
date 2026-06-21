import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIT_SLOP, radii, spacing, useColors, type Palette } from '../theme';

const SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Per-task priority control. The list's `simple` setting picks the affordance: a star that toggles
 * priority 0↔1, or a numeric badge that opens a 0–9 picker. Render-only (no controls) when not
 * editable — a star for >0 in simple mode, the value badge in scale mode.
 */
export function PriorityControl({
  simple,
  value,
  editable,
  onChange,
}: {
  simple: boolean;
  value: number;
  editable: boolean;
  onChange: (priority: number) => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [picking, setPicking] = useState(false);

  if (simple) {
    const on = value > 0;
    if (!editable) return on ? <Ionicons name="star" size={20} color={c.primary} /> : null;
    return (
      <Pressable
        onPress={() => onChange(on ? 0 : 1)}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={on ? 'Clear priority' : 'Set priority'}
        accessibilityState={{ selected: on }}
      >
        {({ pressed }) => (
          <Ionicons
            name={on ? 'star' : 'star-outline'}
            size={20}
            color={on ? c.primary : c.textSubtle}
            style={{ opacity: pressed ? 0.6 : 1 }}
          />
        )}
      </Pressable>
    );
  }

  const badge = (
    <View style={[styles.badge, value > 0 ? styles.badgeOn : styles.badgeOff]}>
      <Text style={[styles.badgeText, value > 0 && styles.badgeTextOn]}>{value}</Text>
    </View>
  );
  if (!editable) return badge;

  return (
    <>
      <Pressable
        onPress={() => setPicking(true)}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Priority ${value}. Change.`}
      >
        {badge}
      </Pressable>
      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Priority</Text>
            <View style={styles.grid}>
              {SCALE.map(n => {
                const sel = n === value;
                return (
                  <Pressable
                    key={n}
                    onPress={() => {
                      onChange(n);
                      setPicking(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set priority ${n}`}
                    accessibilityState={{ selected: sel }}
                    style={[styles.cell, sel && styles.cellOn]}
                  >
                    <Text style={[styles.cellText, sel && styles.cellTextOn]}>{n}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    badge: {
      minWidth: 26,
      height: 26,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      borderWidth: 1,
    },
    badgeOff: { borderColor: c.border },
    badgeOn: { backgroundColor: c.primary, borderColor: c.primary },
    badgeText: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    badgeTextOn: { color: c.onPrimary },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    sheet: { backgroundColor: c.surface, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: 320 },
    sheetTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
    cell: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellOn: { backgroundColor: c.primary, borderColor: c.primary },
    cellText: { fontSize: 16, color: c.text },
    cellTextOn: { color: c.onPrimary, fontWeight: '700' },
  });
