import type { TextStyle } from 'react-native';
import type { Palette } from './colors';

// Semantic text presets, parameterized by palette so colors adapt to the theme. Spread onto a
// style inside a makeStyles(c) factory: `const t = makeType(c); ... title: { ...t.title }`.

export function makeType(c: Palette) {
  return {
    title: { fontSize: 26, fontWeight: '700', color: c.text } as TextStyle,
    heading: { fontSize: 20, fontWeight: '700', color: c.text } as TextStyle,
    bodyLg: { fontSize: 17, color: c.text } as TextStyle,
    body: { fontSize: 16, color: c.text } as TextStyle,
    button: { fontSize: 16, fontWeight: '600' } as TextStyle,
    small: { fontSize: 13, color: c.textMuted } as TextStyle,
    /** Uppercase muted section header (NAME / COLOR / MEMBERS / To do / Done). */
    sectionLabel: { fontSize: 12, fontWeight: '700', color: c.textSubtle } as TextStyle,
    hint: { fontSize: 11, color: c.textSubtle } as TextStyle,
  };
}

export type TypePresets = ReturnType<typeof makeType>;
