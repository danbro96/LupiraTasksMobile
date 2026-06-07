import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ListRole } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { toast } from '../components/Toast';
import { SyncBanner } from '../components/SyncBanner';
import { useLists } from '../offline/useMirror';
import { useMyRole } from '../offline/useMyRole';
import { useAuth } from '../store/auth-store';
import { enqueue } from '../offline/outbox';
import { stamp } from '../offline/ops';
import { colors, listColorOptions, radii, spacing, type } from '../theme';

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
  const ownerCount = list.members.filter(m => m.role === ListRole.Owner).length;
  const isSoleOwner = isOwner && ownerCount === 1;

  async function run(action: () => Promise<void>, failMsg: string, successMsg?: string) {
    try {
      await action();
      if (successMsg) toast(successMsg);
    } catch {
      toast(failMsg);
    }
  }

  async function saveName() {
    const n = name.trim();
    if (!n) {
      toast('Name cannot be empty');
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
      toast('Enter a valid email');
      return;
    }
    if (list!.members.some(m => sameEmail(m.email, email))) {
      toast('Already a member');
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

  function leaveOrDelete() {
    const doLeave = () =>
      run(async () => {
        await enqueue({ ...stamp(), kind: 'list.leave', listId, email: me });
        nav.popToTop();
      }, isSoleOwner ? "Couldn't delete list" : "Couldn't leave list");

    const [title, body, confirmLabel] = isSoleOwner
      ? ['Delete list?', 'You are the last owner — this deletes the list for everyone.', 'Delete']
      : ['Leave list?', "You'll lose access to this shared list.", 'Leave'];

    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: () => void doLeave() },
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
        <View style={styles.swatchRow}>
          {listColorOptions.map(c => {
            const selected = (list.color ?? null) === c;
            return (
              <Pressable
                key={c ?? 'none'}
                onPress={() => void setColor(c)}
                accessibilityRole="button"
                accessibilityLabel={c ? `Color ${c}` : 'No color'}
                accessibilityState={{ selected }}
                style={[styles.swatch, { backgroundColor: c ?? colors.bg }, c === null && styles.swatchNone, selected && styles.swatchSelected]}
              >
                {c === null && !selected ? <Ionicons name="ban-outline" size={16} color={colors.textSubtle} /> : null}
                {selected ? <Ionicons name="checkmark" size={18} color={c ? colors.onPrimary : colors.primary} /> : null}
              </Pressable>
            );
          })}
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

        <Button
          title={isSoleOwner ? 'Delete list' : 'Leave list'}
          variant="destructive"
          onPress={leaveOrDelete}
          style={styles.leaveBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RoleChip({ role, selected, onPress }: { role: ListRole; selected: boolean; onPress: () => void }) {
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

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 48 },
  section: { ...type.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  inlineBtn: { paddingVertical: 0 },
  swatchRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  swatchNone: {},
  swatchSelected: { borderWidth: 3, borderColor: colors.primary },
  member: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  memberHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberEmail: { fontSize: 15, color: colors.text, flex: 1 },
  remove: { color: colors.danger, fontSize: 13 },
  invite: { marginTop: spacing.lg },
  inviteAs: { ...type.small, alignSelf: 'center' },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  roleChip: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  roleChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleText: { fontSize: 13, color: colors.textMuted },
  roleTextOn: { color: colors.onPrimary, fontWeight: '600' },
  roleLabel: { marginTop: spacing.xs, fontSize: 13, color: colors.textSubtle },
  leaveBtn: { marginTop: spacing.xxl },
  empty: { textAlign: 'center', color: colors.textSubtle, marginTop: 40 },
});
