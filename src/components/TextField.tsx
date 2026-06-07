import { useMemo } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

/** Shared single-line/multiline text input. Replaces the duplicated `input` StyleSheet blocks. */
export function TextField({ style, multiline, ...props }: TextInputProps) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={c.textSubtle}
      style={[styles.input, multiline && styles.multiline, style]}
    />
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: t.body.fontSize,
      color: c.text,
    },
    multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
  });
};
