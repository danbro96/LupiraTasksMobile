import type { StyleProp, ViewStyle } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { useColors } from '../theme';

type Variant = 'primary' | 'secondary' | 'destructive';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Shared button. MD3 has no destructive mode, so that variant is an outlined button retinted. */
export function Button({ title, onPress, variant = 'primary', disabled, loading, style, contentStyle, accessibilityLabel }: Props) {
  const c = useColors();
  const destructive = variant === 'destructive';
  return (
    <PaperButton
      mode={variant === 'primary' ? 'contained' : 'outlined'}
      onPress={onPress}
      disabled={disabled || loading}
      loading={loading}
      textColor={destructive ? c.danger : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[destructive && { borderColor: c.danger }, style]}
      contentStyle={contentStyle}
    >
      {title}
    </PaperButton>
  );
}
