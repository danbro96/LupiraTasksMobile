import { create } from 'zustand';
import { hapticError } from './haptics';

// Minimal transient message surface for action-level failures (e.g. "couldn't save change")
// and confirmable actions with an optional inline button (e.g. "Undo"). A single message at a
// time is plenty for this app; a new toast replaces the current one.
//
// This is the cross-cutting *imperative* half of the toast feature — a leaf with no app-layer
// dependencies (zustand only), so any layer (auth, sync, screens) may call `toast()` without
// reaching "upward" into the UI. The visual host lives in ui/components/ToastHost.tsx.

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}

export interface ToastState {
  message: string | null;
  action: ToastAction | null;
  durationMs: number;
  nonce: number; // bumps on every show so the auto-dismiss timer re-arms even for identical text
  show: (message: string, opts?: ToastOptions) => void;
  hide: () => void;
}

export const DEFAULT_DISMISS_MS = 3500;

export const useToast = create<ToastState>(set => ({
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

/** Toast for a failed or blocked action — same as toast(), plus an error haptic. */
export function toastError(message: string): void {
  hapticError();
  toast(message);
}
