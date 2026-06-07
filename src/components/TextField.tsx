import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { colors, radii, spacing, type } from '../theme';

/** Shared single-line/multiline text input. Replaces the duplicated `input` StyleSheet blocks. */
export function TextField({ style, multiline, ...props }: TextInputProps) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={colors.textSubtle}
      style={[styles.input, multiline && styles.multiline, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    color: colors.text,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
});
