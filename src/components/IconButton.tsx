import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIT_SLOP, useColors } from '../theme';

interface Props {
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
}

/** A tappable icon, primarily for navigation headers. Replaces emoji header glyphs. */
export function IconButton({ name, onPress, accessibilityLabel, color, size = 24 }: Props) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      {({ pressed }) => <Ionicons name={name} size={size} color={color ?? c.primary} style={{ opacity: pressed ? 0.6 : 1 }} />}
    </Pressable>
  );
}
