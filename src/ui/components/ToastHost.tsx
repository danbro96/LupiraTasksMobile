import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useColors, type Palette } from '../theme';
import { useToast } from '../../feedback/toast';

// The imperative toast API + store live in feedback/toast (a cross-cutting leaf, so non-UI layers
// can call `toast()` without importing the UI). This file is just the visual host.

/** Mount once near the app root (inside SafeAreaProvider). Renders the current toast, if any. */
export function ToastHost() {
  const message = useToast(s => s.message);
  const action = useToast(s => s.action);
  const durationMs = useToast(s => s.durationMs);
  const nonce = useToast(s => s.nonce);
  const hide = useToast(s => s.hide);
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, durationMs);
    return () => clearTimeout(t);
  }, [message, nonce, durationMs, hide]);

  if (!message) return null;

  return (
    // Without an action the toast is purely informational and lets touches pass through;
    // with an action we allow the button to receive touches (box-none keeps the rest pass-through).
    <View pointerEvents={action ? 'box-none' : 'none'} style={[styles.wrap, { bottom: insets.bottom + 24 }]}>
      <View style={styles.toast}>
        <Text style={[styles.text, !action && styles.textCentered]}>{message}</Text>
        {action ? (
          <Pressable
            onPress={() => {
              action.onPress();
              hide();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.xl },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      backgroundColor: c.toastBg,
      borderRadius: radii.lg,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      maxWidth: '100%',
    },
    // The toast surface is dark in both schemes, so its label stays light.
    text: { color: '#fff', fontSize: 14, flexShrink: 1 },
    textCentered: { textAlign: 'center' },
    action: { color: c.toastAction, fontSize: 14, fontWeight: '700' },
  });
