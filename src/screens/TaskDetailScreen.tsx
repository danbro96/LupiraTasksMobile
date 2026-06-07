import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useMyRole, canEditWithRole } from '../offline/useMyRole';
import { requestItemDelete } from '../offline/pendingDeletes';
import { enqueue } from '../offline/outbox';
import { stamp } from '../offline/ops';
import { dueInDays, dueNextWeekend, formatDue } from '../util/dueDate';
import { colors, radii, spacing, type } from '../theme';

const DUE_CHIPS: { label: string; iso: () => string }[] = [
  { label: 'Today', iso: () => dueInDays(0) },
  { label: 'Tomorrow', iso: () => dueInDays(1) },
  { label: 'Weekend', iso: dueNextWeekend },
  { label: 'Next week', iso: () => dueInDays(7) },
];

export function TaskDetailScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { listId, itemId } = params;

  const { items, loading } = useItems(listId);
  const { lists } = useLists();
  const item = items.find(i => i.id === itemId);
  const list = lists.find(l => l.id === listId);
  const canEdit = canEditWithRole(useMyRole(listId));

  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');

  const members = useMemo(() => list?.members.map(m => m.email) ?? [], [list]);
  const due = formatDue(item?.dueAt);

  useLayoutEffect(() => {
    nav.setOptions({ title: 'Task' });
  }, [nav]);

  // Seed the editable fields from the item once it loads from the mirror (the hooks read
  // asynchronously, so `item` is undefined on first render). Keyed on the item id so a remote
  // in-place edit doesn't clobber an in-progress local edit, but a fresh task still populates.
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setNotes(item.notes ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) {
    return (
      <View style={styles.fill}>
        <SyncBanner />
        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.textSubtle} />
        ) : (
          <Text style={styles.empty}>This task is no longer available.</Text>
        )}
      </View>
    );
  }

  async function run(action: () => Promise<void>, failMsg: string) {
    try {
      await action();
    } catch {
      toast(failMsg);
    }
  }

  function saveTitle() {
    const t = title.trim();
    if (!t || t === item!.title) return;
    void run(() => enqueue({ ...stamp(), kind: 'item.rename', listId, itemId, title: t }), "Couldn't rename task");
  }

  function saveNotes() {
    const n = notes.trim() || null;
    if ((n ?? null) === (item!.notes ?? null)) return;
    void run(() => enqueue({ ...stamp(), kind: 'item.notes', listId, itemId, notes: n }), "Couldn't save notes");
  }

  const setDue = (iso: string | null) =>
    run(() => enqueue({ ...stamp(), kind: 'item.due', listId, itemId, dueAt: iso }), "Couldn't set due date");

  const setAssignee = (email: string | null) =>
    run(() => enqueue({ ...stamp(), kind: 'item.assign', listId, itemId, assigneeEmail: email }), "Couldn't assign task");

  const toggleComplete = () =>
    run(
      () => enqueue({ ...stamp(), kind: item!.completed ? 'item.reopen' : 'item.complete', listId, itemId }),
      "Couldn't update task",
    );

  function onDelete() {
    requestItemDelete(listId, itemId, 'Task deleted');
    nav.goBack();
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          style={styles.completeRow}
          onPress={canEdit ? () => void toggleComplete() : undefined}
          disabled={!canEdit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.completed, disabled: !canEdit }}
          accessibilityLabel={item.completed ? 'Completed' : 'Mark complete'}
        >
          <Ionicons
            name={item.completed ? 'checkbox' : 'square-outline'}
            size={24}
            color={!canEdit ? colors.textDisabled : item.completed ? colors.primary : colors.textSubtle}
          />
          <Text style={styles.completeLabel}>{item.completed ? 'Completed' : 'Mark complete'}</Text>
        </Pressable>

        <Text style={styles.section}>TITLE</Text>
        <TextField
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
          editable={canEdit}
          returnKeyType="done"
          accessibilityLabel="Task title"
        />

        <Text style={styles.section}>DUE DATE</Text>
        {due ? (
          <Text style={[styles.currentDue, due.overdue && styles.overdue]}>
            {due.overdue ? 'Overdue · ' : ''}
            {due.label}
          </Text>
        ) : (
          <Text style={styles.noneText}>No due date</Text>
        )}
        {canEdit ? (
          <View style={styles.chipRow}>
            {DUE_CHIPS.map(c => (
              <Pressable key={c.label} style={styles.chip} onPress={() => void setDue(c.iso())} accessibilityRole="button">
                <Text style={styles.chipText}>{c.label}</Text>
              </Pressable>
            ))}
            {item.dueAt ? (
              <Pressable style={styles.chip} onPress={() => void setDue(null)} accessibilityRole="button">
                <Text style={styles.chipText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.section}>ASSIGNEE</Text>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, !item.assignedTo && styles.chipOn]}
            onPress={canEdit ? () => void setAssignee(null) : undefined}
            disabled={!canEdit}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, !item.assignedTo && styles.chipTextOn]}>Unassigned</Text>
          </Pressable>
          {members.map(email => {
            const on = item.assignedTo?.toLowerCase() === email.toLowerCase();
            return (
              <Pressable
                key={email}
                style={[styles.chip, on && styles.chipOn]}
                onPress={canEdit ? () => void setAssignee(email) : undefined}
                disabled={!canEdit}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{email}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>NOTES</Text>
        <TextField
          value={notes}
          onChangeText={setNotes}
          onBlur={saveNotes}
          editable={canEdit}
          multiline
          placeholder={canEdit ? 'Add notes…' : undefined}
          accessibilityLabel="Task notes"
        />

        {canEdit ? (
          <Button title="Delete task" variant="destructive" onPress={onDelete} style={styles.delete} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48 },
  completeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  completeLabel: { ...type.bodyLg },
  section: { ...type.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
  currentDue: { ...type.body, marginBottom: spacing.sm },
  overdue: { color: colors.danger, fontWeight: '600' },
  noneText: { ...type.small, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextOn: { color: colors.onPrimary, fontWeight: '600' },
  delete: { marginTop: spacing.xxl },
  empty: { textAlign: 'center', color: colors.textSubtle, marginTop: 40 },
  loading: { marginTop: 40 },
});
