import { useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListKind } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { SegmentedPicker } from '../components/SegmentedPicker';
import { TextField } from '../components/TextField';
import { ColorSwatches } from '../components/ColorSwatches';
import { SyncBanner } from '../components/SyncBanner';
import { toastError } from '../../feedback/toast';
import { enqueue } from '../../sync/outbox';
import { newId, stamp } from '../../domain/ops';
import { logDebug } from '../../debug/log';
import { spacing, useColors, type Palette } from '../theme';

const KINDS = [ListKind.Todo, ListKind.Shopping] as const;
const KIND_LABELS: Record<ListKind, string> = { [ListKind.Todo]: 'To-do', [ListKind.Shopping]: 'Shopping', [ListKind.Agent]: 'Agent' };
const KIND_HINTS: Record<ListKind, string> = {
  [ListKind.Todo]: 'A simple checklist.',
  [ListKind.Shopping]: 'Shopping lists let you set quantities (e.g. 2 kg).',
  [ListKind.Agent]: '',
};

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
        <Button variant="text" title="Cancel" onPress={() => nav.goBack()} />
      ),
      headerRight: () => (
        <Button variant="text" title="Create" onPress={() => void create()} disabled={!canCreate} accessibilityLabel="Create list" />
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, name, kind, color, styles]);

  const kindHint = KIND_HINTS[kind];

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="labelMedium" style={styles.section}>NAME</Text>
        <TextField
          placeholder="List name…"
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={create}
          accessibilityLabel="List name"
        />

        <Text variant="labelMedium" style={styles.section}>TYPE</Text>
        <SegmentedPicker options={KINDS} selected={kind} onSelect={setKind} getLabel={k => KIND_LABELS[k]} />
        <Text variant="bodySmall" style={styles.hint}>{kindHint}</Text>

        <Text variant="labelMedium" style={styles.section}>COLOR</Text>
        <ColorSwatches value={color} onChange={setColor} />

        <Button
          variant="text"
          title="Import tasks…"
          onPress={() => nav.navigate('ImportList')}
          style={styles.importLink}
          accessibilityLabel="Import tasks"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    section: { color: c.textSubtle, marginTop: spacing.xl, marginBottom: spacing.sm },
    hint: { color: c.textSubtle, marginTop: spacing.sm },
    importLink: { marginTop: spacing.xxl, alignSelf: 'flex-start' },
  });
