import { Checkbox as PaperCheckbox } from 'react-native-paper';
import { useColors } from '../theme';

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
    <PaperCheckbox.Android
      status={checked ? 'checked' : 'unchecked'}
      onPress={onPress}
      disabled={disabled}
      color={c.primary}
      uncheckedColor={c.textSubtle}
      accessibilityLabel={accessibilityLabel ?? (checked ? 'Completed' : 'Not completed')}
    />
  );
}
