import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeType, spacing, useColors, type Palette } from '../theme';

interface Props {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  disabled?: boolean;
  divider?: boolean;
  accessibilityLabel?: string;
}

/** Icon-leading metadata row (label + right-aligned value + chevron) for detail screens. */
export function DetailRow({ icon, label, value, valueColor, onPress, disabled, divider = true, accessibilityLabel }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const interactive = !!onPress && !disabled;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && interactive && styles.pressed]}
      onPress={onPress}
      disabled={!interactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
    >
      <Ionicons name={icon} size={20} color={c.textSubtle} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
      {interactive ? <Ionicons name="chevron-forward" size={18} color={c.textDisabled} /> : null}
    </Pressable>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    pressed: { backgroundColor: c.divider },
    label: { ...t.body },
    value: { ...t.body, color: c.textMuted, flex: 1, textAlign: 'right' },
  });
};
