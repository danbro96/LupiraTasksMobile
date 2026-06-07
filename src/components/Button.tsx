import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { HIT_SLOP, makeType, radii, spacing, useColors, type Palette } from '../theme';

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
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'destructive' && styles.destructive,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? c.onPrimary : c.primary} />
      ) : (
        <Text
          style={[
            styles.btnText,
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            variant === 'destructive' && styles.destructiveText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    base: { borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
    primary: { backgroundColor: c.primary },
    secondary: { borderWidth: 1, borderColor: c.border },
    destructive: { borderWidth: 1, borderColor: c.danger },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.8 },
    btnText: { ...t.button },
    primaryText: { color: c.onPrimary },
    secondaryText: { color: c.primary },
    destructiveText: { color: c.danger },
  });
};
