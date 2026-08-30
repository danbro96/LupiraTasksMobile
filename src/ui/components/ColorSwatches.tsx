import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { listColorOptions, radii, spacing, useColors, type Palette } from '../theme';
import { ICONS } from '../icons';

/** Row of selectable list colors (incl. "no color"). Shared by CreateList and ListSettings. */
export function ColorSwatches({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.row}>
      {listColorOptions.map(col => {
        const selected = (value ?? null) === col;
        return (
          <Pressable
            key={col ?? 'none'}
            onPress={() => onChange(col)}
            accessibilityRole="button"
            accessibilityLabel={col ? `Color ${col}` : 'No color'}
            accessibilityState={{ selected }}
            style={[styles.swatch, { backgroundColor: col ?? c.bg }, selected && styles.selected]}
          >
            {col === null && !selected ? <MaterialIcons name={ICONS.close} size={16} color={c.textSubtle} /> : null}
            {selected ? <MaterialIcons name={ICONS.check} size={18} color={col ? c.onPrimary : c.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
    swatch: { width: 36, height: 36, borderRadius: radii.pill, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    selected: { borderWidth: 3, borderColor: c.primary },
  });
