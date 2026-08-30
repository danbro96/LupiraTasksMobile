import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Chip, Dialog, Portal } from 'react-native-paper';
import { HIT_SLOP, radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

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
    if (!editable) return on ? <MaterialIcons name={ICONS.star} size={20} color={c.primary} /> : null;
    return (
      <Pressable
        onPress={() => onChange(on ? 0 : 1)}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={on ? 'Clear priority' : 'Set priority'}
        accessibilityState={{ selected: on }}
      >
        {({ pressed }) => (
          <MaterialIcons
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
      <Portal>
        <Dialog visible={picking} onDismiss={() => setPicking(false)}>
          <Dialog.Title>Priority</Dialog.Title>
          <Dialog.Content>
            <View style={styles.grid}>
              {SCALE.map(n => (
                <Chip
                  key={n}
                  selected={n === value}
                  showSelectedCheck={false}
                  onPress={() => {
                    onChange(n);
                    setPicking(false);
                  }}
                  accessibilityLabel={`Set priority ${n}`}
                >
                  {String(n)}
                </Chip>
              ))}
            </View>
          </Dialog.Content>
        </Dialog>
      </Portal>
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
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  });
