import type { TextStyle } from 'react-native';
import { colors } from './colors';

// Semantic text presets. Spread onto a Text/StyleSheet style: <Text style={type.body}>.
// Uses the system font (San Francisco / Roboto) — matches the prior inline styling.

export const type = {
  title: { fontSize: 26, fontWeight: '700', color: colors.text } as TextStyle,
  heading: { fontSize: 20, fontWeight: '700', color: colors.text } as TextStyle,
  bodyLg: { fontSize: 17, color: colors.text } as TextStyle,
  body: { fontSize: 16, color: colors.text } as TextStyle,
  button: { fontSize: 16, fontWeight: '600' } as TextStyle,
  small: { fontSize: 13, color: colors.textMuted } as TextStyle,
  /** Uppercase muted section header (NAME / COLOR / MEMBERS / To do / Done). */
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSubtle } as TextStyle,
  hint: { fontSize: 11, color: colors.textSubtle } as TextStyle,
} as const;
