import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ListKind } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { TextField } from '../components/TextField';
import { DetailRow } from '../components/DetailRow';
import { ActionMenu, type ActionItem } from '../components/ActionMenu';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { toast } from '../components/Toast';
import { useItems, useLists } from '../offline/useMirror';
import { useMyRole, canEditWithRole } from '../offline/useMyRole';
import { useOutboxStatus } from '../offline/useOutboxStatus';
import { useDirectory } from '../offline/useDirectory';
import { requestItemDeleteMany } from '../offline/pendingDeletes';
import { childrenOf, nextChildSortOrder, descendantIds } from '../offline/itemTree';
import { enqueue } from '../offline/outbox';
import { newId, stamp } from '../offline/ops';
import { dueInDays, dueNextWeekend, dueOnDate, formatDue } from '../util/dueDate';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

const DUE_QUICK: { label: string; iso: () => string }[] = [
  { label: 'Today', iso: () => dueInDays(0) },
  { label: 'Tomorrow', iso: () => dueInDays(1) },
  { label: 'This weekend', iso: dueNextWeekend },
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
  const status = useOutboxStatus().get(itemId);
  const name = useDirectory();

  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity) : '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [subTitle, setSubTitle] = useState('');
  const [dueMenu, setDueMenu] = useState(false);
  const [assigneeMenu, setAssigneeMenu] = useState(false);
  const [iosDate, setIosDate] = useState<Date | null>(null);

  // Latest field values + last-persisted baselines, so we can flush unsaved edits on unmount
  // (hardware/gesture back doesn't reliably fire onBlur) without re-enqueueing saved text.
  const titleRef = useRef(title);
  const notesRef = useRef(notes);
  const savedTitle = useRef(item?.title ?? '');
  const savedNotes = useRef(item?.notes ?? '');
  titleRef.current = title;
  notesRef.current = notes;

  const members = useMemo(() => list?.members.map(m => m.email) ?? [], [list]);
  const subtasks = useMemo(() => childrenOf(items, itemId), [items, itemId]);
  const subtasksDone = subtasks.filter(s => s.completed).length;
  const due = formatDue(item?.dueAt);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  // Header shows a sync dot for this task so saves are visibly persisted (nothing when synced).
  useLayoutEffect(() => {
    nav.setOptions({
      title: 'Task',
      headerRight: () => (
        <View style={styles.headerDot}>
          <SyncDot status={status} />
        </View>
      ),
    });
  }, [nav, status, styles]);

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

  // Seed editable fields once the item loads from the mirror (hooks read asynchronously). Keyed on
  // item id so a remote in-place edit doesn't clobber an in-progress local edit.
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
    run(() => enqueue({ ...stamp(), kind: item!.completed ? 'item.reopen' : 'item.complete', listId, itemId }), "Couldn't update task");

  const toggleSub = (st: { id: string; completed: boolean }) =>
    run(() => enqueue({ ...stamp(), kind: st.completed ? 'item.reopen' : 'item.complete', listId, itemId: st.id }), "Couldn't update subtask");

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
    requestItemDeleteMany(listId, [itemId, ...descendantIds(items, itemId)], 'Task deleted');
    nav.goBack();
  }

  function openNativeDate() {
    const current = item?.dueAt ? new Date(item.dueAt) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (e, d) => {
          if (e.type === 'set' && d) void setDue(dueOnDate(d));
        },
      });
    } else {
      setIosDate(current);
    }
  }

  const dueActions: ActionItem[] = [
    ...DUE_QUICK.map(q => ({ label: q.label, onPress: () => void setDue(q.iso()) })),
    { label: 'Pick a date…', onPress: openNativeDate },
    ...(item.dueAt ? [{ label: 'Clear due date', destructive: true, onPress: () => void setDue(null) }] : []),
  ];

  const assigneeActions: ActionItem[] = [
    { label: 'Unassigned', selected: !item.assignedTo, onPress: () => void setAssignee(null) },
    ...members.map(email => ({
      label: name(email),
      selected: item.assignedTo?.toLowerCase() === email.toLowerCase(),
      onPress: () => void setAssignee(email),
    })),
  ];

  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[styles.titleInput, item.completed && styles.titleDone]}
          value={title}
          onChangeText={setTitle}
          onBlur={saveTitle}
          editable={canEdit}
          multiline
          placeholder="Task title"
          placeholderTextColor={c.textSubtle}
          accessibilityLabel="Task title"
        />

        <Pressable
          style={styles.completeRow}
          onPress={canEdit ? () => void toggleComplete() : undefined}
          disabled={!canEdit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.completed, disabled: !canEdit }}
          accessibilityLabel={item.completed ? 'Completed' : 'Mark complete'}
        >
          <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => void toggleComplete()} />
          <Text style={styles.completeLabel}>{item.completed ? 'Completed' : 'Mark complete'}</Text>
        </Pressable>

        <View style={styles.card}>
          <DetailRow
            icon="calendar-outline"
            label="Due"
            value={due ? (due.overdue ? `Overdue · ${due.label}` : due.label) : 'None'}
            valueColor={due?.overdue ? c.danger : undefined}
            onPress={canEdit ? () => setDueMenu(true) : undefined}
          />
          <DetailRow
            icon="person-outline"
            label="Assignee"
            value={item.assignedTo ? name(item.assignedTo) : 'Unassigned'}
            onPress={canEdit ? () => setAssigneeMenu(true) : undefined}
            divider={false}
          />
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

        <Text style={styles.section}>
          SUBTASKS{subtasks.length > 0 ? ` · ${subtasksDone}/${subtasks.length} done` : ''}
        </Text>
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

        {item.createdBy || item.completedBy ? (
          <View style={styles.provenance}>
            {item.createdBy ? <Text style={styles.provText}>Added by {name(item.createdBy)}</Text> : null}
            {item.completed && item.completedBy ? (
              <Text style={styles.provText}>
                Completed by {name(item.completedBy)}
                {item.completedAt ? ` · ${fmtDate(item.completedAt)}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        {canEdit ? <Button title="Delete task" variant="destructive" onPress={onDelete} style={styles.delete} /> : null}
      </ScrollView>

      <ActionMenu visible={dueMenu} title="Due date" actions={dueActions} onClose={() => setDueMenu(false)} />
      <ActionMenu visible={assigneeMenu} title="Assignee" actions={assigneeActions} onClose={() => setAssigneeMenu(false)} />

      {/* iOS date picker (Android uses the imperative DateTimePickerAndroid dialog). */}
      <Modal visible={iosDate !== null} transparent animationType="slide" onRequestClose={() => setIosDate(null)}>
        <Pressable style={styles.iosBackdrop} onPress={() => setIosDate(null)}>
          <Pressable style={styles.iosSheet} onPress={() => {}}>
            {iosDate ? (
              <RNDateTimePicker value={iosDate} mode="date" display="inline" onChange={(_e, d) => d && setIosDate(d)} />
            ) : null}
            <Button
              title="Set date"
              onPress={() => {
                if (iosDate) void setDue(dueOnDate(iosDate));
                setIosDate(null);
              }}
              style={styles.iosSet}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    headerDot: { paddingRight: spacing.xs },
    titleInput: { ...t.title, paddingVertical: spacing.sm },
    titleDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    completeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
    completeLabel: { ...t.bodyLg },
    card: { backgroundColor: c.surface, borderRadius: radii.lg, overflow: 'hidden' },
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    noneText: { ...t.small, marginBottom: spacing.sm },
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
    provenance: { marginTop: spacing.xl, gap: 2 },
    provText: { ...t.hint, color: c.textSubtle },
    delete: { marginTop: spacing.xl },
    iosBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    iosSheet: { backgroundColor: c.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg },
    iosSet: { marginTop: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
};
