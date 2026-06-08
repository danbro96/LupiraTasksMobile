import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListRole } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { ColorSwatches } from '../components/ColorSwatches';
import { toast, toastError } from '../../feedback/toast';
import { SyncBanner } from '../components/SyncBanner';
import { useLists } from '../hooks/useMirror';
import { useMyRole } from '../hooks/useMyRole';
import { useAuth } from '../../state/auth-store';
import { usePrefs } from '../../state/prefs-store';
import { enqueue } from '../../sync/outbox';
import { stamp } from '../../domain/ops';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

const ROLES: ListRole[] = [ListRole.Owner, ListRole.Editor, ListRole.Viewer];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ListSettingsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListSettings'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { lists } = useLists();
  const list = lists.find(l => l.id === listId);
  const me = useAuth(s => s.user?.sub) ?? '';
  const myRole = useMyRole(listId);
  const [name, setName] = useState(list?.name ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ListRole>(ListRole.Editor);
  const hideCompleted = usePrefs(s => s.hideCompleted[listId] ?? false);
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

  const changeRole = (email: string, role: ListRole) =>
    run(() => enqueue({ ...stamp(), kind: 'list.memberRoleChange', listId, email, role }), "Couldn't change role");

  function confirmRemove(email: string) {
    Alert.alert('Remove member?', `${email} will lose access to this list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void run(() => enqueue({ ...stamp(), kind: 'list.memberRemove', listId, email }), "Couldn't remove member"),
      },
    ]);
  }

  function archive() {
    void run(async () => {
      await enqueue({ ...stamp(), kind: 'list.archive', listId });
      nav.popToTop();
    }, "Couldn't archive list");
  }

  function confirmDelete() {
    Alert.alert('Delete list?', 'This permanently deletes the list for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await enqueue({ ...stamp(), kind: 'list.delete', listId });
            nav.popToTop();
          }, "Couldn't delete list"),
      },
    ]);
  }

  function confirmLeave() {
    Alert.alert('Leave list?', "You'll lose access to this shared list.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await enqueue({ ...stamp(), kind: 'list.leave', listId, email: me });
            nav.popToTop();
          }, "Couldn't leave list"),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>NAME</Text>
        <View style={styles.row}>
          <TextField value={name} onChangeText={setName} onSubmitEditing={saveName} returnKeyType="done" accessibilityLabel="List name" />
          <Button title="Save" onPress={saveName} style={styles.inlineBtn} />
        </View>

        <Text style={styles.section}>COLOR</Text>
        <ColorSwatches value={list.color ?? null} onChange={c => void setColor(c)} />

        <Text style={styles.section}>DISPLAY</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Hide completed tasks</Text>
          <Switch
            value={hideCompleted}
            onValueChange={v => void usePrefs.getState().setHideCompleted(listId, v)}
            trackColor={{ false: c.border, true: c.primary }}
            accessibilityLabel="Hide completed tasks"
          />
        </View>

        <Text style={styles.section}>MEMBERS</Text>
        {list.members.map(m => {
          const isMe = sameEmail(m.email, me);
          return (
            <View key={m.email} style={styles.member}>
              <View style={styles.memberHead}>
                <Text style={styles.memberEmail}>{m.email}{isMe ? ' (you)' : ''}</Text>
                {isOwner && !isMe ? (
                  <Pressable onPress={() => confirmRemove(m.email)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${m.email}`}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              {isOwner ? (
                <View style={styles.roleRow}>
                  {ROLES.map(r => (
                    <RoleChip key={r} role={r} selected={m.role === r} onPress={() => m.role !== r && void changeRole(m.email, r)} />
                  ))}
                </View>
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
              <Button title="Add" onPress={addMember} disabled={!newEmail.trim()} style={styles.inlineBtn} />
            </View>
            <View style={styles.roleRow}>
              <Text style={styles.inviteAs}>Invite as</Text>
              {ROLES.map(r => (
                <RoleChip key={r} role={r} selected={inviteRole === r} onPress={() => setInviteRole(r)} />
              ))}
            </View>
          </View>
        ) : null}

        {isOwner ? (
          <>
            <Button title="Archive list" variant="secondary" onPress={archive} style={styles.archiveBtn} />
            <Button title="Delete list" variant="destructive" onPress={confirmDelete} style={styles.deleteBtn} />
          </>
        ) : (
          <Button title="Leave list" variant="destructive" onPress={confirmLeave} style={styles.leaveBtn} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleChip({ role, selected, onPress }: { role: ListRole; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const styles = useMemo(() => makeChipStyles(c), [c]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={role}
      accessibilityState={{ selected }}
      style={[styles.roleChip, selected && styles.roleChipOn]}
    >
      <Text style={[styles.roleText, selected && styles.roleTextOn]}>{role}</Text>
    </Pressable>
  );
}

const makeChipStyles = (c: Palette) =>
  StyleSheet.create({
    roleChip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border },
    roleChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    roleText: { fontSize: 13, color: c.textMuted },
    roleTextOn: { color: c.onPrimary, fontWeight: '600' },
  });

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLabel: { ...t.body, flex: 1, paddingRight: spacing.md },
    inlineBtn: { paddingVertical: 0 },
    member: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
    memberHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    memberEmail: { fontSize: 15, color: c.text, flex: 1 },
    remove: { color: c.danger, fontSize: 13 },
    invite: { marginTop: spacing.lg },
    inviteAs: { ...t.small, alignSelf: 'center' },
    roleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
    roleLabel: { marginTop: spacing.xs, fontSize: 13, color: c.textSubtle },
    archiveBtn: { marginTop: spacing.xxl },
    deleteBtn: { marginTop: spacing.md },
    leaveBtn: { marginTop: spacing.xxl },
    empty: { textAlign: 'center', color: c.textSubtle, marginTop: 40 },
  });
};
