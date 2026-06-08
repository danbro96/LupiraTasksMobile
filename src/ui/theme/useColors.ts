import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type Palette } from './colors';

/** The active palette, following the system light/dark setting (live). */
export function useColors(): Palette {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}
