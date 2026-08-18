import type { StyleProp, ViewStyle } from 'react-native';
import { Button as PaperButton, useTheme } from 'react-native-paper';

type Variant = 'primary' | 'secondary' | 'destructive';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Shared button. Replaces the per-screen inline Pressable + Text blocks. */
export function Button({ title, onPress, variant = 'primary', disabled, loading, style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const destructive = variant === 'destructive';
  return (
    <PaperButton
      mode={variant === 'primary' ? 'contained' : 'outlined'}
      onPress={onPress}
      disabled={disabled || loading}
      loading={loading}
      textColor={destructive ? colors.error : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[destructive && { borderColor: colors.error }, style]}
    >
      {title}
    </PaperButton>
  );
}
