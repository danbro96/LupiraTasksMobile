import { StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { IconButton as PaperIconButton } from 'react-native-paper';
import { useColors } from '../theme';

interface Props {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
}

/** A tappable icon, primarily for navigation headers. Replaces emoji header glyphs. */
export function IconButton({ name, onPress, accessibilityLabel, color, size = 24 }: Props) {
  const c = useColors();
  return (
    <PaperIconButton
      icon={name}
      size={size}
      iconColor={color ?? c.primary}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: { margin: 0 },
});
