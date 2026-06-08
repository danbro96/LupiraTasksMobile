import * as Haptics from 'expo-haptics';

// Fire-and-forget haptics, reserved for meaningful moments (task completion, errors, drag pickup,
// destructive commits) — not every tap, or they become noise. Each safely no-ops where the
// platform can't vibrate. A leaf module (expo-haptics only), so any layer may call it.

/** Task completed / positive outcome. */
export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Action failed or was blocked. */
export function hapticError(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/** Physical "thunk" — e.g. picking up a row to reorder, or committing a delete. */
export function hapticImpact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium): void {
  void Haptics.impactAsync(style).catch(() => {});
}

/** Light tick for crossing a threshold / changing a selection. */
export function hapticSelection(): void {
  void Haptics.selectionAsync().catch(() => {});
}
