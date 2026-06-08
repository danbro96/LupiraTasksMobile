// Color tokens for light and dark schemes. Both palettes share the same keys (Palette), so
// components consume `useColors()` and switch automatically with the system theme.

export interface Palette {
  bg: string;
  surface: string;
  primary: string;
  onPrimary: string;
  border: string;
  divider: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;
  onAccent: string;
  danger: string;
  warning: string;
  pending: string;
  failed: string;
  bannerOffline: string;
  bannerUnreachable: string;
  bannerSyncing: string;
  toastBg: string;
  toastAction: string;
}

export const lightColors: Palette = {
  bg: '#ffffff',
  surface: '#f5f6f8',
  primary: '#1d3a5f',
  onPrimary: '#ffffff',
  border: '#d4d8e0',
  divider: '#e3e6ec',
  text: '#1c2230',
  textMuted: '#6e7686',
  textSubtle: '#8a909c',
  textDisabled: '#9aa0ac',
  onAccent: '#ffffff',
  danger: '#b3261e',
  warning: '#5b4b18',
  pending: '#d8a200',
  failed: '#b3261e',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#1d3a5f',
  toastBg: '#2b2f36',
  toastAction: '#6ea8fe',
};

export const darkColors: Palette = {
  bg: '#14171c',
  surface: '#1e232b',
  primary: '#4f83c2',
  onPrimary: '#0d1117',
  border: '#2c333d',
  divider: '#252b33',
  text: '#e6e9ee',
  textMuted: '#9aa3b2',
  textSubtle: '#7c8492',
  textDisabled: '#5b626e',
  onAccent: '#ffffff',
  danger: '#f2675e',
  warning: '#d8b24a',
  pending: '#d8a200',
  failed: '#f2675e',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#244a73',
  toastBg: '#2b2f36',
  toastAction: '#6ea8fe',
};

/** Default (light) palette — for any non-component context that can't use the hook. */
export const colors = lightColors;

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
