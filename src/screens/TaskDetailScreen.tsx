import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { TextField } from '../components/TextField';
import { SyncBanner } from '../components/SyncBanner';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useMyRole, canEditWithRole } from '../offline/useMyRole';
import { requestItemDelete } from '../offline/pendingDeletes';
import { childrenOf, nextChildSortOrder } from '../offline/itemTree';
import { enqueue } from '../offline/outbox';
import { newId, stamp } from '../offline/ops';
import { dueInDays, dueNextWeekend, formatDue } from '../util/dueDate';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

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
  const isShopping = list?.kind === ListKind.Shopping;

  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [subTitle, setSubTitle] = useState('');

  // Latest field values + last-persisted baselines. Lets us flush unsaved edits on unmount
  // (hardware/gesture back doesn't reliably fire onBlur) without re-enqueueing saved text.
  const titleRef = useRef(title);
  const notesRef = useRef(notes);
  const savedTitle = useRef(item?.title ?? '');
  const savedNotes = useRef(item?.notes ?? '');
  titleRef.current = title;
  notesRef.current = notes;

  const members = useMemo(() => list?.members.map(m => m.email) ?? [], [list]);
  const subtasks = useMemo(() => childrenOf(items, itemId), [items, itemId]);
  const due = formatDue(item?.dueAt);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  useLayoutEffect(() => {
    nav.setOptions({ title: 'Task' });
  }, [nav]);

  // Flush any unsaved title/notes when leaving the screen, comparing against the last-saved
  // baseline so an onBlur that already saved doesn't enqueue a duplicate.
  useEffect(() => {
    return () => {
      const t = titleRef.current.trim();
      if (t && t !== savedTitle.current) {
        void enqueue({ ...stamp(), kind: 'item.rename', listId, itemId, title: t }).catch(() => {});
      }
      const n = notesRef.current.trim() || null;
      if ((n ?? null) !== (savedNotes.current || null)) {
        void enqueue({ ...stamp(), kind: 'item.notes', listId, itemId, notes: n }).catch(() => {});
      }
    };
  }, [listId, itemId]);

  // Seed the editable fields from the item once it loads from the mirror (the hooks read
  // asynchronously, so `item` is undefined on first render). Keyed on the item id so a remote
  // in-place edit doesn't clobber an in-progress local edit, but a fresh task still populates.
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setNotes(item.notes ?? '');
      setQty(item.quantity != null ? String(item.quantity) : '');
      setUnit(item.unit ?? '');
      savedTitle.current = item.title;
      savedNotes.current = item.notes ?? '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) {
    return (
      <View style={styles.fill}>
        <SyncBanner />
        {loading ? (
          <ActivityIndicator style={styles.loading} color={c.textSubtle} />
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
    const t = titleRef.current.trim();
    if (!t || t === savedTitle.current) return;
    savedTitle.current = t;
    void run(() => enqueue({ ...stamp(), kind: 'item.rename', listId, itemId, title: t }), "Couldn't rename task");
  }

  function saveNotes() {
    const n = notesRef.current.trim() || null;
    if ((n ?? null) === (savedNotes.current || null)) return;
    savedNotes.current = n ?? '';
    void run(() => enqueue({ ...stamp(), kind: 'item.notes', listId, itemId, notes: n }), "Couldn't save notes");
  }

  function saveQuantity() {
    const parsed = qty.trim() === '' ? null : Number(qty.trim());
    const qVal = parsed != null && Number.isFinite(parsed) ? parsed : null;
    const u = unit.trim() || null;
    if ((qVal ?? null) === (item!.quantity ?? null) && (u ?? null) === (item!.unit ?? null)) return;
    void run(() => enqueue({ ...stamp(), kind: 'item.quantity', listId, itemId, quantity: qVal, unit: u }), "Couldn't set quantity");
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

  const toggleSub = (st: { id: string; completed: boolean }) =>
    run(
      () => enqueue({ ...stamp(), kind: st.completed ? 'item.reopen' : 'item.complete', listId, itemId: st.id }),
      "Couldn't update subtask",
    );

  async function addSubtask() {
    const t = subTitle.trim();
    if (!t) return;
    setSubTitle('');
    await run(
      () =>
        enqueue({
          ...stamp(),
          kind: 'item.create',
          listId,
          itemId: newId(),
          title: t,
          sortOrder: nextChildSortOrder(items, itemId),
          parentItemId: itemId,
        }),
      "Couldn't add subtask",
    );
  }

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
            color={!canEdit ? c.textDisabled : item.completed ? c.primary : c.textSubtle}
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

        {isShopping ? (
          <>
            <Text style={styles.section}>QUANTITY</Text>
            <View style={styles.qtyRow}>
              <TextField
                value={qty}
                onChangeText={setQty}
                onBlur={saveQuantity}
                editable={canEdit}
                keyboardType="numeric"
                placeholder="Qty"
                style={styles.qtyInput}
                accessibilityLabel="Quantity"
              />
              <TextField
                value={unit}
                onChangeText={setUnit}
                onBlur={saveQuantity}
                editable={canEdit}
                placeholder="Unit (e.g. kg)"
                returnKeyType="done"
                style={styles.unitInput}
                accessibilityLabel="Unit"
              />
            </View>
          </>
        ) : null}

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

        <Text style={styles.section}>SUBTASKS</Text>
        {subtasks.length === 0 ? <Text style={styles.noneText}>No subtasks</Text> : null}
        {subtasks.map(st => (
          <Pressable
            key={st.id}
            style={styles.subRow}
            onPress={() => nav.push('TaskDetail', { listId, itemId: st.id })}
            accessibilityRole="button"
            accessibilityLabel={st.title}
            accessibilityHint="Opens subtask"
          >
            <Checkbox checked={st.completed} disabled={!canEdit} onPress={() => void toggleSub(st)} />
            <Text style={[styles.subTitle, st.completed && styles.subDone]} numberOfLines={1}>{st.title}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
          </Pressable>
        ))}
        {canEdit ? (
          <View style={styles.subAddRow}>
            <TextField
              placeholder="Add subtask…"
              value={subTitle}
              onChangeText={setSubTitle}
              onSubmitEditing={addSubtask}
              returnKeyType="done"
              accessibilityLabel="New subtask title"
            />
            <Button title="Add" onPress={addSubtask} disabled={!subTitle.trim()} style={styles.inlineBtn} />
          </View>
        ) : null}

        {canEdit ? (
          <Button title="Delete task" variant="destructive" onPress={onDelete} style={styles.delete} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    completeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    completeLabel: { ...t.bodyLg },
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    currentDue: { ...t.body, marginBottom: spacing.sm },
    overdue: { color: c.danger, fontWeight: '600' },
    noneText: { ...t.small, marginBottom: spacing.sm },
    chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.textMuted },
    chipTextOn: { color: c.onPrimary, fontWeight: '600' },
    qtyRow: { flexDirection: 'row', gap: spacing.sm },
    qtyInput: { flex: 1 },
    unitInput: { flex: 2 },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    subTitle: { ...t.body, flex: 1 },
    subDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    subAddRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    inlineBtn: { paddingVertical: 0 },
    delete: { marginTop: spacing.xxl },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
