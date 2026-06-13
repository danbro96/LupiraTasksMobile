import { useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListKind } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { TextField } from '../components/TextField';
import { ColorSwatches } from '../components/ColorSwatches';
import { SyncBanner } from '../components/SyncBanner';
import { toastError } from '../../feedback/toast';
import { enqueue } from '../../sync/outbox';
import { newId, stamp } from '../../domain/ops';
import { logDebug } from '../../debug/log';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

const KINDS: { kind: ListKind; label: string; hint: string }[] = [
  { kind: ListKind.Todo, label: 'To-do', hint: 'A simple checklist.' },
  { kind: ListKind.Shopping, label: 'Shopping', hint: 'Shopping lists let you set quantities (e.g. 2 kg).' },
];

export function CreateListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>(ListKind.Todo);
  const [color, setColor] = useState<string | null>(null);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  async function create() {
    const n = name.trim();
    if (!n) {
      toastError('Name cannot be empty');
      return;
    }
    try {
      await enqueue({ ...stamp(), kind: 'list.create', listId: newId(), name: n, listKind: kind, color });
      nav.goBack();
    } catch (e) {
      toastError("Couldn't create list");
      logDebug('createList:error', e instanceof Error ? e.message : String(e));
    }
  }

  // Modal actions live in the header (always visible, reachable with the keyboard up). Re-set as
  // name/kind/color change so Create's enabled state and the closed-over values stay current.
  useLayoutEffect(() => {
    const canCreate = !!name.trim();
    nav.setOptions({
      headerLeft: () => (
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.headerCancel}>Cancel</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={() => void create()}
          disabled={!canCreate}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Create list"
          accessibilityState={{ disabled: !canCreate }}
        >
          <Text style={[styles.headerCreate, !canCreate && styles.headerCreateDisabled]}>Create</Text>
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, name, kind, color, styles]);

  const kindHint = KINDS.find(k => k.kind === kind)?.hint ?? '';

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>NAME</Text>
        <TextField
          placeholder="List name…"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={create}
          accessibilityLabel="List name"
        />

        <Text style={styles.section}>TYPE</Text>
        <View style={styles.chipRow}>
          {KINDS.map(k => {
            const on = kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                onPress={() => setKind(k.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{kindHint}</Text>

        <Text style={styles.section}>COLOR</Text>
        <ColorSwatches value={color} onChange={setColor} />

        <Pressable
          onPress={() => nav.navigate('ImportList')}
          style={styles.importLink}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Import tasks"
        >
          <Text style={styles.importLinkText}>Import tasks…</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    headerCancel: { ...t.button, color: c.primary },
    headerCreate: { ...t.button, color: c.primary },
    headerCreateDisabled: { color: c.textDisabled },
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    chip: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 14, color: c.textMuted },
    chipTextOn: { color: c.onPrimary, fontWeight: '600' },
    hint: { ...t.small, color: c.textSubtle, marginTop: spacing.sm },
    importLink: { marginTop: spacing.xxl, alignSelf: 'flex-start' },
    importLinkText: { ...t.body, color: c.primary },
  });
};
