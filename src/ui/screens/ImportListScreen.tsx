import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { generateKeyBetween } from 'fractional-indexing';
import { ListKind } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { ChipRow } from '../components/ChipRow';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { toastError } from '../../feedback/toast';
import { enqueueMany } from '../../sync/outbox';
import { newId, stamp, type ClientOp } from '../../domain/ops';
import { parseImport, type ImportedTask } from '../../domain/importTasks';
import { logDebug } from '../../debug/log';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

const KINDS = [ListKind.Todo, ListKind.Shopping] as const;
// Keyed by the full ListKind union (ChipRow widens its label callback to ListKind). Agent lists
// aren't user-importable, so the label is inert — KINDS controls which chips actually render.
const KIND_LABELS: Record<ListKind, string> = { [ListKind.Todo]: 'To-do', [ListKind.Shopping]: 'Shopping', [ListKind.Agent]: 'Agent' };

/** Build the full op batch for an imported list: create the list, then each task in order
 *  (sequential fractional keys; parents tracked per nesting level), with follow-up ops for
 *  completed / notes / quantity / due. */
function buildImportOps(name: string, kind: ListKind, tasks: ImportedTask[]): ClientOp[] {
  const listId = newId();
  const ops: ClientOp[] = [{ ...stamp(), kind: 'list.create', listId, name, listKind: kind, color: null }];
  const lastIdAtLevel: string[] = [];
  let prevKey: string | null = null;
  for (const t of tasks) {
    const itemId = newId();
    const parentItemId = t.level > 0 ? (lastIdAtLevel[t.level - 1] ?? null) : null;
    // One global ascending key chain: within any sibling group the subsequence stays ordered.
    prevKey = generateKeyBetween(prevKey, null);
    ops.push({ ...stamp(), kind: 'item.create', listId, itemId, title: t.title, sortOrder: prevKey, parentItemId });
    if (t.completed) ops.push({ ...stamp(), kind: 'item.complete', listId, itemId });
    if (t.notes) ops.push({ ...stamp(), kind: 'item.notes', listId, itemId, notes: t.notes });
    if (t.quantity != null || t.unit) {
      ops.push({ ...stamp(), kind: 'item.quantity', listId, itemId, quantity: t.quantity, unit: t.unit });
    }
    if (t.dueAt) ops.push({ ...stamp(), kind: 'item.due', listId, itemId, dueAt: t.dueAt });
    lastIdAtLevel[t.level] = itemId;
    lastIdAtLevel.length = t.level + 1; // deeper levels now belong to a previous branch
  }
  return ops;
}

export function ImportListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>(ListKind.Todo);
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  const parsed = useMemo(() => (csvText.trim() ? parseImport(csvText) : null), [csvText]);
  const canImport = !!name.trim() && parsed?.ok === true && !busy;

  // Prefill name/kind from a JSON export's header — but only while the user hasn't named the
  // list themselves, so a round-trip is one paste while a manual name is never clobbered.
  useEffect(() => {
    if (parsed?.ok && parsed.name && !name.trim()) setName(parsed.name);
    if (parsed?.ok && (parsed.kind === ListKind.Todo || parsed.kind === ListKind.Shopping)) setKind(parsed.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  async function importList() {
    if (!parsed?.ok || !name.trim()) return;
    setBusy(true);
    try {
      await enqueueMany(buildImportOps(name.trim(), kind, parsed.tasks));
      nav.goBack();
    } catch (e) {
      toastError("Couldn't import list");
      logDebug('importList:error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Modal actions live in the header (always visible, reachable with the keyboard up) — same
  // pattern as CreateListScreen.
  useLayoutEffect(() => {
    nav.setOptions({
      headerLeft: () => (
        <Pressable onPress={() => nav.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.headerCancel}>Cancel</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={() => void importList()}
          disabled={!canImport}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Import list"
          accessibilityState={{ disabled: !canImport }}
        >
          <Text style={[styles.headerImport, !canImport && styles.headerImportDisabled]}>Import</Text>
        </Pressable>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, name, kind, csvText, busy, styles]);

  const preview = parsed
    ? parsed.ok
      ? `${parsed.tasks.length} task${parsed.tasks.length === 1 ? '' : 's'}` +
        (parsed.tasks.some(t => t.completed) ? `, ${parsed.tasks.filter(t => t.completed).length} completed` : '')
      : parsed.error
    : 'Paste a JSON export or one task per line.';

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
          accessibilityLabel="List name"
        />

        <Text style={styles.section}>TYPE</Text>
        <ChipRow options={KINDS} selected={kind} onSelect={setKind} getLabel={k => KIND_LABELS[k]} />

        <Text style={styles.section}>TASKS (JSON OR ONE PER LINE)</Text>
        <TextField
          placeholder={'Paste a JSON export…\nor just:\nMilk\nBread'}
          value={csvText}
          onChangeText={setCsvText}
          multiline
          style={styles.csvInput}
          accessibilityLabel="Tasks to import"
        />
        <Text style={[styles.preview, parsed && !parsed.ok && styles.previewError]}>{preview}</Text>
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
    headerImport: { ...t.button, color: c.primary },
    headerImportDisabled: { color: c.textDisabled },
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    csvInput: { minHeight: 160, textAlignVertical: 'top', borderRadius: radii.md },
    preview: { ...t.small, marginTop: spacing.sm },
    previewError: { color: c.danger },
  });
};
