import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

// Minimal transient message surface for action-level failures (e.g. "couldn't save change").
// A single message at a time is plenty for this app; a new toast replaces the current one.

interface ToastState {
  message: string | null;
  nonce: number; // bumps on every show so the auto-dismiss timer re-arms even for identical text
  show: (message: string) => void;
  hide: () => void;
}

const useToast = create<ToastState>(set => ({
  message: null,
  nonce: 0,
  show: message => set(s => ({ message, nonce: s.nonce + 1 })),
  hide: () => set({ message: null }),
}));

/** Show a transient toast message. Safe to call from anywhere (not just React components). */
export function toast(message: string): void {
  useToast.getState().show(message);
}

const DISMISS_MS = 3500;

/** Mount once near the app root (inside SafeAreaProvider). Renders the current toast, if any. */
export function ToastHost() {
  const message = useToast(s => s.message);
  const nonce = useToast(s => s.nonce);
  const hide = useToast(s => s.hide);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, DISMISS_MS);
    return () => clearTimeout(t);
  }, [message, nonce, hide]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 24 }]}>
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  toast: { backgroundColor: '#2b2f36', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, maxWidth: '100%' },
  text: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
