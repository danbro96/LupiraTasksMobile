import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radii, spacing } from '../theme';

// Minimal transient message surface for action-level failures (e.g. "couldn't save change")
// and confirmable actions with an optional inline button (e.g. "Undo"). A single message at a
// time is plenty for this app; a new toast replaces the current one.

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}

interface ToastState {
  message: string | null;
  action: ToastAction | null;
  durationMs: number;
  nonce: number; // bumps on every show so the auto-dismiss timer re-arms even for identical text
  show: (message: string, opts?: ToastOptions) => void;
  hide: () => void;
}

const DEFAULT_DISMISS_MS = 3500;

const useToast = create<ToastState>(set => ({
  message: null,
  action: null,
  durationMs: DEFAULT_DISMISS_MS,
  nonce: 0,
  show: (message, opts) =>
    set(s => ({
      message,
      action: opts?.action ?? null,
      durationMs: opts?.durationMs ?? DEFAULT_DISMISS_MS,
      nonce: s.nonce + 1,
    })),
  hide: () => set({ message: null, action: null }),
}));

/**
 * Show a transient toast. Safe to call from anywhere (not just React components).
 * Pass `action` to render an inline button (e.g. Undo); `durationMs` overrides the dismiss delay.
 */
export function toast(message: string, opts?: ToastOptions): void {
  useToast.getState().show(message, opts);
}

/** Mount once near the app root (inside SafeAreaProvider). Renders the current toast, if any. */
export function ToastHost() {
  const message = useToast(s => s.message);
  const action = useToast(s => s.action);
  const durationMs = useToast(s => s.durationMs);
  const nonce = useToast(s => s.nonce);
  const hide = useToast(s => s.hide);
  const insets = useSafeAreaInsets();

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

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.xl },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.toastBg,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    maxWidth: '100%',
  },
  text: { color: '#fff', fontSize: 14, flexShrink: 1 },
  textCentered: { textAlign: 'center' },
  action: { color: colors.toastAction, fontSize: 14, fontWeight: '700' },
});
