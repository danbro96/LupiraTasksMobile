import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { List, Text } from 'react-native-paper';
import { spacing, useColors, type Palette } from '../theme';

interface Props {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
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
    <List.Item
      title={label}
      onPress={interactive ? onPress : undefined}
      disabled={!interactive}
      style={divider ? styles.divider : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      left={props => <List.Icon {...props} icon={icon} color={c.textSubtle} />}
      right={props => (
        <View style={[props.style, styles.right]}>
          <Text variant="bodyLarge" style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
            {value}
          </Text>
          {interactive ? <MaterialCommunityIcons name="chevron-right" size={18} color={c.textDisabled} /> : null}
        </View>
      )}
    />
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
    value: { color: c.textMuted, flexShrink: 1, textAlign: 'right' },
  });
