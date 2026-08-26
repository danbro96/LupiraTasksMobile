import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native-paper';
import { KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListRole } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { SegmentedPicker } from '../components/SegmentedPicker';
import { TextField } from '../components/TextField';
import { ColorSwatches } from '../components/ColorSwatches';
import { ShareLinks } from '../components/ShareLinks';
import { useConfirm } from '../components/ConfirmDialog';
import { toast, toastError } from '../../feedback/toast';
import { SyncBanner } from '../components/SyncBanner';
import { useItems, useLists } from '../hooks/useMirror';
import { useMyRole } from '../hooks/useMyRole';
import { useAuth } from '../../state/auth-store';
import { usePrefs } from '../../state/prefs-store';
import { enqueue } from '../../sync/outbox';
import { stamp } from '../../domain/ops';
import { tasksToJson } from '../../domain/exportTasks';
import type { CompletedMode } from '../../domain/itemTree';
import { spacing, useColors, type Palette } from '../theme';

const ROLES: ListRole[] = [ListRole.Owner, ListRole.Editor, ListRole.Viewer];
const COMPLETED_MODES = ['inline', 'below', 'hidden'] as const;
const COMPLETED_LABELS: Record<CompletedMode, string> = { inline: 'Inline', below: 'Below', hidden: 'Hidden' };
const PRIORITY_MODES = ['simple', 'scale'] as const;
const PRIORITY_LABELS: Record<(typeof PRIORITY_MODES)[number], string> = { simple: 'Star', scale: 'Scale (0–9)' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ListSettingsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListSettings'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { lists } = useLists();
  const list = lists.find(l => l.id === listId);
  const { items } = useItems(listId);
  const tagLabels = useMemo(
    () => new Map<string, string>((list?.tags ?? []).map(t => [t.id, t.label] as const)),
    [list],
  );
  const me = useAuth(s => s.user?.principalId) ?? '';
  const myRole = useMyRole(listId);
  const [name, setName] = useState(list?.name ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ListRole>(ListRole.Editor);
  const completedMode = usePrefs(s => s.completedMode[listId] ?? 'inline');
  const confirm = useConfirm();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

  // Seed the name field once the list loads from the mirror (loaded asynchronously, so `list`
  // is undefined on first render). Keyed on the list id so a remote rename doesn't clobber an edit.
  useEffect(() => {
    if (list) setName(list.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list?.id]);

  if (!list) {
    return (
      <View style={styles.fill}>
        <SyncBanner />
        <Text style={styles.empty}>This list is no longer available.</Text>
      </View>
    );
  }

  const isOwner = myRole === ListRole.Owner;

  async function run(action: () => Promise<void>, failMsg: string, successMsg?: string) {
    try {
      await action();
      if (successMsg) toast(successMsg);
    } catch {
      toastError(failMsg);
    }
  }

  async function saveName() {
    const n = name.trim();
    if (!n) {
      toastError('Name cannot be empty');
      return;
    }
    if (n === list!.name) return;
    await run(() => enqueue({ ...stamp(), kind: 'list.rename', listId, name: n }), "Couldn't rename list", 'List name saved');
  }

  const setColor = (color: string | null) =>
    run(() => enqueue({ ...stamp(), kind: 'list.recolor', listId, color }), "Couldn't change color");

  const setSimplePriority = (simple: boolean) =>
    run(() => enqueue({ ...stamp(), kind: 'list.setSimplePriority', listId, simplePriority: simple }), "Couldn't change priority mode");

  async function addMember() {
    const email = newEmail.trim();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toastError('Enter a valid email');
      return;
    }
    if (list!.members.some(m => sameEmail(m.email, email))) {
      toastError('Already a member');
      return;
    }
    setNewEmail('');
    await run(
      () => enqueue({ ...stamp(), kind: 'list.memberAdd', listId, email, role: inviteRole }),
      "Couldn't add member",
      `Added ${email}`,
    );
  }

  const changeRole = (principalId: string, role: ListRole) =>
    run(() => enqueue({ ...stamp(), kind: 'list.memberRoleChange', listId, principalId, role }), "Couldn't change role");

  async function confirmRoleChange(principalId: string, role: ListRole) {
    // Downgrading your own role is how an owner accidentally locks themselves out — confirm it.
    if (!(principalId === me && role !== ListRole.Owner)) {
      void changeRole(principalId, role);
      return;
    }
    const ok = await confirm({
      title: 'Change your own role?',
      message: `You'll become ${role} and lose owner controls for this list.`,
      confirmLabel: 'Change',
      destructive: true,
    });
    if (ok) await changeRole(principalId, role);
  }

  async function confirmRemove(principalId: string, label: string) {
    const ok = await confirm({
      title: 'Remove member?',
      message: `${label} will lose access to this list.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) await run(() => enqueue({ ...stamp(), kind: 'list.memberRemove', listId, principalId }), "Couldn't remove member");
  }

  function exportJson() {
    void Share.share({ message: tasksToJson({ name: list!.name, kind: list!.kind }, items, tagLabels) });
  }

  function archive() {
    void run(async () => {
      await enqueue({ ...stamp(), kind: 'list.archive', listId });
      nav.popToTop();
    }, "Couldn't archive list");
  }

  async function confirmDelete() {
    const ok = await confirm({
      title: 'Delete list?',
      message: 'This permanently deletes the list for everyone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await enqueue({ ...stamp(), kind: 'list.delete', listId });
      nav.popToTop();
    }, "Couldn't delete list");
  }

  async function confirmLeave() {
    const ok = await confirm({
      title: 'Leave list?',
      message: "You'll lose access to this shared list.",
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await enqueue({ ...stamp(), kind: 'list.leave', listId, principalId: me });
      nav.popToTop();
    }, "Couldn't leave list");
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="labelMedium" style={styles.section}>NAME</Text>
        <View style={styles.row}>
          <TextField value={name} onChangeText={setName} onSubmitEditing={saveName} returnKeyType="done" accessibilityLabel="List name" />
          <Button title="Save" onPress={saveName} />
        </View>

        <Text variant="labelMedium" style={styles.section}>COLOR</Text>
        <ColorSwatches value={list.color ?? null} onChange={c => void setColor(c)} />

        <Text variant="labelMedium" style={styles.section}>DISPLAY</Text>
        <Text variant="bodyLarge" style={styles.displayLabel}>Completed tasks</Text>
        <SegmentedPicker
          options={COMPLETED_MODES}
          selected={completedMode}
          onSelect={m => void usePrefs.getState().setCompletedMode(listId, m)}
          getLabel={m => COMPLETED_LABELS[m]}
        />
        <Text variant="bodyLarge" style={[styles.displayLabel, styles.displayLabelGap]}>Priority</Text>
        <SegmentedPicker
          options={PRIORITY_MODES}
          selected={list.simplePriority ? 'simple' : 'scale'}
          onSelect={m => void setSimplePriority(m === 'simple')}
          getLabel={m => PRIORITY_LABELS[m]}
        />

        <Text variant="labelMedium" style={styles.section}>MEMBERS</Text>
        {list.members.map(m => {
          const isMe = m.principalId === me;
          const label = m.displayName ?? m.email;
          // A just-invited member (optimistic placeholder) has no principal id yet — role/remove
          // controls need one, so hold them until the next pull fills it in.
          const canManage = isOwner && !!m.principalId;
          return (
            <View key={m.principalId || m.email} style={styles.member}>
              <View style={styles.memberHead}>
                <Text style={styles.memberEmail}>{label}{isMe ? ' (you)' : ''}</Text>
                {canManage && !isMe ? (
                  <Button
                    variant="destructive"
                    title="Remove"
                    onPress={() => void confirmRemove(m.principalId, label)}
                    accessibilityLabel={`Remove ${label}`}
                  />
                ) : null}
              </View>
              {canManage ? (
                <SegmentedPicker
                  options={ROLES}
                  selected={m.role}
                  onSelect={r => void confirmRoleChange(m.principalId, r)}
                  style={styles.roleRow}
                />
              ) : (
                <Text style={styles.roleLabel}>{m.role}</Text>
              )}
            </View>
          );
        })}

        {isOwner ? (
          <View style={styles.invite}>
            <View style={styles.row}>
              <TextField
                placeholder="Add member by email…"
                autoCapitalize="none"
                keyboardType="email-address"
                value={newEmail}
                onChangeText={setNewEmail}
                onSubmitEditing={addMember}
                returnKeyType="done"
                accessibilityLabel="New member email"
              />
              <Button title="Add" onPress={addMember} disabled={!newEmail.trim()} />
            </View>
            <Text variant="bodySmall" style={styles.inviteAs}>Invite as</Text>
            <SegmentedPicker options={ROLES} selected={inviteRole} onSelect={setInviteRole} />
          </View>
        ) : null}

        <Text variant="labelMedium" style={styles.section}>EXPORT</Text>
        <Button title="Export as JSON" variant="secondary" onPress={exportJson} />

        {isOwner ? <ShareLinks listId={listId} /> : null}

        {isOwner ? (
          <>
            <Button title="Archive list" variant="secondary" onPress={archive} style={styles.archiveBtn} />
            <Button title="Delete list" variant="destructive" onPress={() => void confirmDelete()} style={styles.deleteBtn} />
          </>
        ) : (
          <Button title="Leave list" variant="destructive" onPress={() => void confirmLeave()} style={styles.leaveBtn} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    section: { color: c.textSubtle, marginTop: spacing.xl, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm },
    displayLabel: { marginBottom: spacing.sm },
    displayLabelGap: { marginTop: spacing.lg },
    member: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    memberHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    memberEmail: { fontSize: 15, color: c.text, flex: 1 },
    invite: { marginTop: spacing.lg },
    inviteAs: { color: c.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
    roleRow: { marginTop: spacing.sm },
    roleLabel: { marginTop: spacing.xs, fontSize: 13, color: c.textSubtle },
    archiveBtn: { marginTop: spacing.xxl },
    deleteBtn: { marginTop: spacing.md },
    leaveBtn: { marginTop: spacing.xxl },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
  });
