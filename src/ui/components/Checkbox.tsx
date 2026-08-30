import { Checkbox as PaperCheckbox } from 'react-native-paper';

interface Props {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Accessible checkbox drawn from the icon vocabulary, not a glyph pair. */
export function Checkbox({ checked, onPress, disabled, accessibilityLabel }: Props) {
  return (
    <PaperCheckbox.Android
      status={checked ? 'checked' : 'unchecked'}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? (checked ? 'Completed' : 'Not completed')}
    />
  );
}
