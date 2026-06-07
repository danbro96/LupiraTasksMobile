import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, HIT_SLOP } from '../theme';

interface Props {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Accessible checkbox using a vector icon (replaces the ☑/☐ emoji glyphs). */
export function Checkbox({ checked, onPress, disabled, accessibilityLabel }: Props) {
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
        color={disabled ? colors.textDisabled : checked ? colors.primary : colors.textSubtle}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: 28, alignItems: 'center', justifyContent: 'center' },
});
