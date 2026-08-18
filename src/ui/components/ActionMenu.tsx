import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Portal, TouchableRipple } from 'react-native-paper';
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
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        style={styles.wrapper}
        contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}
      >
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
        {actions.map((a, i) => (
          <TouchableRipple
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
            <View style={styles.actionInner}>
              <Text style={[styles.actionText, a.destructive && styles.destructive]} numberOfLines={1}>{a.label}</Text>
              {a.selected ? <MaterialCommunityIcons name="check" size={20} color={c.primary} style={styles.check} /> : null}
            </View>
          </TouchableRipple>
        ))}
        <TouchableRipple style={styles.cancel} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableRipple>
      </Modal>
    </Portal>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    wrapper: { justifyContent: 'flex-end', marginBottom: 0 },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    title: { ...t.sectionLabel, textAlign: 'center', paddingVertical: spacing.md },
    action: { paddingVertical: spacing.lg },
    actionInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    actionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    actionText: { ...t.bodyLg, color: c.primary },
    check: { position: 'absolute', right: 0 },
    destructive: { color: c.danger },
    cancel: { marginTop: spacing.sm, paddingVertical: spacing.lg, alignItems: 'center', backgroundColor: c.surface, borderRadius: radii.md },
    cancelText: { ...t.button, color: c.textMuted },
  });
};
