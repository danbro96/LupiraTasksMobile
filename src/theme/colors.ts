// Centralized color tokens. Single source of truth for every screen/component so the
// palette is consistent and a future dark theme is a swap here rather than a hunt across files.
// Seeded from the values previously hardcoded inline across screens.

export const colors = {
  // Surfaces
  bg: '#ffffff',
  surface: '#f5f6f8',

  // Brand / actions
  primary: '#1d3a5f',
  onPrimary: '#ffffff',

  // Lines
  border: '#d4d8e0',
  divider: '#e3e6ec',

  // Text
  text: '#1c2230',
  textMuted: '#6e7686',
  textSubtle: '#8a909c',
  textDisabled: '#9aa0ac',
  onAccent: '#ffffff',

  // Semantic
  danger: '#b3261e',
  warning: '#5b4b18',
  pending: '#d8a200',
  failed: '#b3261e',

  // Sync banner backgrounds
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#1d3a5f',

  // Toast
  toastBg: '#2b2f36',
  toastAction: '#6ea8fe',
} as const;

/** The selectable list colors offered in List settings. `null` = no color. */
export const listColorOptions: (string | null)[] = [
  null,
  '#d23b3b',
  '#e8820e',
  '#2a9d5a',
  '#3a86c8',
  '#8a4fc4',
  '#5b6470',
];
