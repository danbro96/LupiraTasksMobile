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
  danger: string;
  /** Identity surfaces only — the mark, the splash, theme-color, primaryColor. Never the UI:
   *  a second accent competing with `primary` is exactly what the palette work removed. */
  brand: string;
  pending: string;
  failed: string;
  /** Backdrop for a row that just changed because someone else edited it. */
  remoteChange: string;
  bannerOffline: string;
  bannerUnreachable: string;
  bannerSyncing: string;
  toastBg: string;
  toastAction: string;
}

export const lightColors: Palette = {
  bg: '#ffffff',
  surface: '#f5f6f8',
  primary: '#0d9488',
  onPrimary: '#ffffff',
  border: '#d4d8e0',
  divider: '#e3e6ec',
  text: '#1c2230',
  textMuted: '#6e7686',
  textSubtle: '#8a909c',
  textDisabled: '#9aa0ac',
  brand: '#E76F51',
  danger: '#b3261e',
  pending: '#d8a200',
  failed: '#b3261e',
  remoteChange: '#dce9f9',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#0f766e',
  toastBg: '#2b2f36',
  toastAction: '#2dd4bf',
};

export const darkColors: Palette = {
  bg: '#14171c',
  surface: '#1e232b',
  primary: '#2dd4bf',
  onPrimary: '#042f2e',
  border: '#2c333d',
  divider: '#252b33',
  text: '#e6e9ee',
  textMuted: '#9aa3b2',
  textSubtle: '#7c8492',
  textDisabled: '#5b626e',
  brand: '#E76F51',
  danger: '#f2675e',
  pending: '#d8a200',
  failed: '#f2675e',
  remoteChange: '#25384f',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#115e59',
  toastBg: '#2b2f36',
  toastAction: '#2dd4bf',
};

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
