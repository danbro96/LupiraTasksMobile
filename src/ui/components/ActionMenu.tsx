import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

export interface ActionItem {
  label: string;
  destructive?: boolean;
  /** Show a trailing checkmark (e.g. the current choice in a picker). */
  selected?: boolean;
  onPress: () => void;
}

/** Bottom action sheet (Modal-based) — a cross-platform menu that, unlike Android's Alert,
 *  isn't capped at 3 buttons. Tapping an action closes the sheet then runs it. */
export function ActionMenu({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: ActionItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss menu">
        {/* Inner press is swallowed so taps on the sheet don't dismiss it. */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]} onPress={() => {}}>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              style={[styles.action, i > 0 && styles.actionBorder]}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: a.selected }}
            >
              <Text style={[styles.actionText, a.destructive && styles.destructive]} numberOfLines={1}>{a.label}</Text>
              {a.selected ? <Ionicons name="checkmark" size={20} color={c.primary} style={styles.check} /> : null}
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    title: { ...t.sectionLabel, textAlign: 'center', paddingVertical: spacing.md },
    action: { paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    actionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    actionText: { ...t.bodyLg, color: c.primary },
    check: { position: 'absolute', right: 0 },
    destructive: { color: c.danger },
    cancel: { marginTop: spacing.sm, paddingVertical: spacing.lg, alignItems: 'center', backgroundColor: c.surface, borderRadius: radii.md },
    cancelText: { ...t.button, color: c.textMuted },
  });
};
