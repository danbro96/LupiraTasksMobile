import { MD3DarkTheme, MD3LightTheme, adaptNavigationTheme } from 'react-native-paper';
import { DarkTheme as NavDarkBase, DefaultTheme as NavLightBase } from '@react-navigation/native';
import { darkColors, lightColors, type Palette } from './colors';
import { radii } from './spacing';

// Only the keys MD3 has a slot for; sync/banner/toast semantics stay on useColors().
function md3Colors(p: Palette) {
  return {
    primary: p.primary,
    onPrimary: p.onPrimary,
    background: p.bg,
    onBackground: p.text,
    surface: p.surface,
    onSurface: p.text,
    onSurfaceVariant: p.textMuted,
    outline: p.border,
    outlineVariant: p.divider,
    error: p.danger,
  };
}

export const paperLight = { ...MD3LightTheme, roundness: radii.sm, colors: { ...MD3LightTheme.colors, ...md3Colors(lightColors) } };
export const paperDark = { ...MD3DarkTheme, roundness: radii.sm, colors: { ...MD3DarkTheme.colors, ...md3Colors(darkColors) } };

const adapted = adaptNavigationTheme({
  reactNavigationLight: NavLightBase,
  reactNavigationDark: NavDarkBase,
  materialLight: paperLight,
  materialDark: paperDark,
});

export const navLight = adapted.LightTheme;
export const navDark = adapted.DarkTheme;
