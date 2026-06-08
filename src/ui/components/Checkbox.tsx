import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIT_SLOP, useColors } from '../theme';

interface Props {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Accessible checkbox using a vector icon (replaces the ☑/☐ emoji glyphs). */
export function Checkbox({ checked, onPress, disabled, accessibilityLabel }: Props) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? (checked ? 'Completed' : 'Not completed')}
      style={styles.box}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={24}
        color={disabled ? c.textDisabled : checked ? c.primary : c.textSubtle}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 28, alignItems: 'center', justifyContent: 'center' },
});
