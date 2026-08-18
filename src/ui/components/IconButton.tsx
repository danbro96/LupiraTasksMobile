import { StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { IconButton as PaperIconButton, useTheme } from 'react-native-paper';

interface Props {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
}

/** A tappable icon, primarily for navigation headers. Replaces emoji header glyphs. */
export function IconButton({ name, onPress, accessibilityLabel, color, size = 24 }: Props) {
  const { colors } = useTheme();
  return (
    <PaperIconButton
      icon={name}
      size={size}
      iconColor={color ?? colors.primary}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: { margin: 0 },
});
