import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { radii, spacing, useColors, type Palette } from '../theme';

/** A row of single-select chips — the shared pattern behind list-kind, completed-mode, and
 *  display-settings pickers. */
export function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  getLabel,
  style,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  getLabel?: (value: T) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const label = (v: T) => (getLabel ? getLabel(v) : v);
  return (
    <View style={[styles.row, style]}>
      {options.map(opt => {
        const on = opt === selected;
        return (
          <Pressable
            key={opt}
            onPress={() => !on && onSelect(opt)}
            accessibilityRole="button"
            accessibilityLabel={label(opt)}
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{label(opt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
    chip: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    text: { fontSize: 14, color: c.textMuted },
    textOn: { color: c.onPrimary, fontWeight: '600' },
  });
