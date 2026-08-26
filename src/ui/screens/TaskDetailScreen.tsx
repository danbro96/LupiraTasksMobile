import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, List, Text } from 'react-native-paper';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ListKind } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { TextField } from '../components/TextField';
import { DetailRow } from '../components/DetailRow';
import { PriorityControl } from '../components/PriorityControl';
import { ActionMenu, type ActionItem } from '../components/ActionMenu';
import { SyncBanner } from '../components/SyncBanner';
import { SyncDot } from '../components/SyncDot';
import { toastError } from '../../feedback/toast';
import { hapticSuccess } from '../../feedback/haptics';
import { useItems, useLists } from '../hooks/useMirror';
import { useMyRole, canEditWithRole } from '../hooks/useMyRole';
import { useOutboxStatus } from '../hooks/useOutboxStatus';
import { useDirectory } from '../hooks/useDirectory';
import { requestItemDeleteMany } from '../state/pendingDeletes';
import { childrenOf, nextChildSortOrder, descendantIds } from '../../domain/itemTree';
import { enqueue } from '../../sync/outbox';
import { newId, stamp } from '../../domain/ops';
import { oneLine } from '../../domain/text';
import { dueInDays, dueNextWeekend, dueOnDate, formatDue } from '../../domain/dueDate';
import { radii, spacing, useColors, type Palette } from '../theme';

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
  const qtyRef = useRef(qty);
  const unitRef = useRef(unit);
  const savedTitle = useRef(item?.title ?? '');
  const savedNotes = useRef(item?.notes ?? '');
  const savedQty = useRef(item?.quantity != null ? String(item.quantity) : '');
  const savedUnit = useRef(item?.unit ?? '');
  titleRef.current = title;
  notesRef.current = notes;
  qtyRef.current = qty;
  unitRef.current = unit;

  const members = useMemo(() => list?.members ?? [], [list]);
  const memberNames = useMemo(() => new Map(members.map(m => [m.principalId, m.displayName ?? m.email])), [members]);
  // Assignees are always members (resolved inline); created/completed-by may be a non-member, so
  // fall back to the org directory.
  const personName = (principalId: string | null | undefined): string =>
    principalId ? (memberNames.get(principalId) ?? name(principalId)) : '';
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
      const parsed = qtyRef.current.trim() === '' ? null : Number(qtyRef.current.trim());
      const quantity = parsed != null && Number.isFinite(parsed) ? parsed : null;
      const u = unitRef.current.trim() || null;
      const savedQ = savedQty.current === '' ? null : Number(savedQty.current);
      if (quantity !== savedQ || (u ?? null) !== (savedUnit.current || null)) {
        void enqueue({ ...stamp(), kind: 'item.quantity', listId, itemId, quantity, unit: u }).catch(() => {});
      }
    };
  }, [listId, itemId]);

  // Seed editable fields once the item loads (hooks read asynchronously), and adopt refreshed
  // server values into fields the user hasn't touched (input still equals the last-saved
  // baseline) — otherwise the unmount flush would re-enqueue the stale baseline with a newer
  // occurredAt and revert the remote edit under LWW. Fields mid-edit keep the local draft.
  const seededId = useRef<string | null>(null);
  useEffect(() => {
    if (!item) return;
    const fresh = seededId.current !== item.id;
    seededId.current = item.id;
    const adopt = (server: string, saved: { current: string }, latest: { current: string }, set: (v: string) => void) => {
      if (fresh || latest.current === saved.current) {
        set(server);
        latest.current = server;
      }
      saved.current = server;
    };
    adopt(item.title, savedTitle, titleRef, setTitle);
    adopt(item.notes ?? '', savedNotes, notesRef, setNotes);
    adopt(item.quantity != null ? String(item.quantity) : '', savedQty, qtyRef, setQty);
    adopt(item.unit ?? '', savedUnit, unitRef, setUnit);
  }, [item]);

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
      toastError(failMsg);
    }
  }

  function saveTitle() {
    const t = oneLine(titleRef.current).trim();
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
    savedQty.current = qVal != null ? String(qVal) : '';
    savedUnit.current = u ?? '';
    void run(() => enqueue({ ...stamp(), kind: 'item.quantity', listId, itemId, quantity: qVal, unit: u }), "Couldn't set quantity");
  }

  const setDue = (iso: string | null) =>
    run(() => enqueue({ ...stamp(), kind: 'item.due', listId, itemId, dueAt: iso }), "Couldn't set due date");

  const setAssignee = (member: { principalId: string; email: string } | null) =>
    run(
      () => enqueue({ ...stamp(), kind: 'item.assign', listId, itemId, assigneePrincipalId: member?.principalId ?? null, assigneeEmail: member?.email ?? null }),
      "Couldn't assign task",
    );

  const setPriority = (priority: number) =>
    run(() => enqueue({ ...stamp(), kind: 'item.priority', listId, itemId, priority }), "Couldn't set priority");

  const toggleComplete = () => {
    if (!item!.completed) hapticSuccess();
    return run(() => enqueue({ ...stamp(), kind: item!.completed ? 'item.reopen' : 'item.complete', listId, itemId }), "Couldn't update task");
  };

  const toggleSub = (st: { id: string; completed: boolean }) => {
    if (!st.completed) hapticSuccess();
    return run(() => enqueue({ ...stamp(), kind: st.completed ? 'item.reopen' : 'item.complete', listId, itemId: st.id }), "Couldn't update subtask");
  };

  async function addSubtask() {
    const t = oneLine(subTitle).trim();
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
    ...members.map(m => ({
      label: m.displayName ?? m.email,
      selected: item.assignedTo === m.principalId,
      onPress: () => void setAssignee(m),
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
          // multiline is for visual wrapping only — titles are single-line data, so hard breaks
          // (pasted text) are stripped as typed and Enter commits instead of breaking the line.
          onChangeText={t => setTitle(oneLine(t))}
          onBlur={saveTitle}
          editable={canEdit}
          multiline
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          placeholder="Task title"
          placeholderTextColor={c.textSubtle}
          accessibilityLabel="Task title"
        />

        <List.Item
          style={styles.completeRow}
          title={item.completed ? 'Completed' : 'Mark complete'}
          onPress={canEdit ? () => void toggleComplete() : undefined}
          disabled={!canEdit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.completed, disabled: !canEdit }}
          left={() => <Checkbox checked={item.completed} disabled={!canEdit} onPress={() => void toggleComplete()} />}
        />

        <View style={styles.card}>
          <DetailRow
            icon="calendar-outline"
            label="Due"
            value={due ? (due.overdue ? `Overdue · ${due.label}` : due.label) : 'None'}
            valueColor={due?.overdue ? c.danger : undefined}
            onPress={canEdit ? () => setDueMenu(true) : undefined}
          />
          <DetailRow
            icon="account-outline"
            label="Assignee"
            value={item.assignedTo ? personName(item.assignedTo) : 'Unassigned'}
            onPress={canEdit ? () => setAssigneeMenu(true) : undefined}
            divider={false}
          />
        </View>

        <Text variant="labelMedium" style={styles.section}>PRIORITY</Text>
        <View style={styles.priorityRow}>
          <PriorityControl
            simple={list?.simplePriority ?? true}
            value={item.priority}
            editable={canEdit}
            onChange={p => void setPriority(p)}
          />
          <Text variant="bodyLarge" style={styles.priorityHint}>
            {(list?.simplePriority ?? true)
              ? item.priority > 0 ? 'Starred' : 'Not starred'
              : `Level ${item.priority}`}
          </Text>
        </View>

        {isShopping ? (
          <>
            <Text variant="labelMedium" style={styles.section}>QUANTITY</Text>
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

        <Text variant="labelMedium" style={styles.section}>NOTES</Text>
        <TextField
          value={notes}
          onChangeText={setNotes}
          onBlur={saveNotes}
          editable={canEdit}
          multiline
          placeholder={canEdit ? 'Add notes…' : undefined}
          accessibilityLabel="Task notes"
        />

        <Text variant="labelMedium" style={styles.section}>
          SUBTASKS{subtasks.length > 0 ? ` · ${subtasksDone}/${subtasks.length} done` : ''}
        </Text>
        {subtasks.length === 0 ? <Text variant="bodySmall" style={styles.noneText}>No subtasks</Text> : null}
        {subtasks.map(st => (
          <List.Item
            key={st.id}
            style={styles.subRow}
            title={st.title}
            titleNumberOfLines={1}
            titleStyle={st.completed ? styles.subDone : undefined}
            onPress={() => nav.push('TaskDetail', { listId, itemId: st.id })}
            accessibilityHint="Opens subtask"
            left={() => <Checkbox checked={st.completed} disabled={!canEdit} onPress={() => void toggleSub(st)} />}
            right={() => <MaterialCommunityIcons name="chevron-right" size={16} color={c.textDisabled} />}
          />
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
            <Button title="Add" onPress={addSubtask} disabled={!subTitle.trim()} />
          </View>
        ) : null}

        {item.createdBy || item.completedBy ? (
          <View style={styles.provenance}>
            {item.createdBy ? <Text variant="labelSmall" style={styles.provText}>Added by {personName(item.createdBy)}</Text> : null}
            {item.completed && item.completedBy ? (
              <Text variant="labelSmall" style={styles.provText}>
                Completed by {personName(item.completedBy)}
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    headerDot: { paddingRight: spacing.xs },
    // A TextInput takes no Paper variant, so the title type is spelled out here.
    titleInput: { fontSize: 26, fontWeight: '700', color: c.text, paddingVertical: spacing.sm },
    titleDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    completeRow: { paddingHorizontal: 0, marginBottom: spacing.md },
    card: { backgroundColor: c.surface, borderRadius: radii.lg, overflow: 'hidden' },
    section: { color: c.textSubtle, marginTop: spacing.xl, marginBottom: spacing.sm },
    noneText: { color: c.textMuted, marginBottom: spacing.sm },
    priorityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    priorityHint: { color: c.textMuted },
    qtyRow: { flexDirection: 'row', gap: spacing.sm },
    qtyInput: { flex: 1 },
    unitInput: { flex: 2 },
    subRow: { paddingHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    subDone: { color: c.textDisabled, textDecorationLine: 'line-through' },
    subAddRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    provenance: { marginTop: spacing.xl, gap: 2 },
    provText: { color: c.textSubtle },
    delete: { marginTop: spacing.xl },
    iosBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    iosSheet: { backgroundColor: c.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg },
    iosSet: { marginTop: spacing.sm },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
    loading: { marginTop: 40 },
  });
