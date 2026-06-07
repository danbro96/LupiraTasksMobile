import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListRole } from '../api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { toast } from '../components/Toast';
import { SyncBanner } from '../components/SyncBanner';
import { useLists } from '../offline/useMirror';
import { enqueue } from '../offline/outbox';
import { stamp } from '../offline/ops';
import { useAuth } from '../store/auth-store';

const COLORS: (string | null)[] = [null, '#d23b3b', '#e8820e', '#2a9d5a', '#3a86c8', '#8a4fc4', '#5b6470'];
const ROLES: ListRole[] = [ListRole.Owner, ListRole.Editor, ListRole.Viewer];
const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ListSettingsScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'ListSettings'>>();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listId = params.listId;
  const { lists } = useLists();
  const list = lists.find(l => l.id === listId);
  const me = useAuth(s => s.user?.sub) ?? '';
  const [name, setName] = useState(list?.name ?? '');
  const [newEmail, setNewEmail] = useState('');

  if (!list) {
    return (
      <View style={styles.fill}>
        <SyncBanner />
        <Text style={styles.empty}>This list is no longer available.</Text>
      </View>
    );
  }

  const myRole = list.members.find(m => sameEmail(m.email, me))?.role;
  const isOwner = myRole === ListRole.Owner;
  const ownerCount = list.members.filter(m => m.role === ListRole.Owner).length;

  async function run(action: () => Promise<void>, failMsg: string) {
    try { await action(); } catch { toast(failMsg); }
  }

  async function saveName() {
    const n = name.trim();
    if (!n || n === list!.name) return;
    await run(() => enqueue({ ...stamp(), kind: 'list.rename', listId, name: n }), "Couldn't rename list");
  }

  const setColor = (color: string | null) =>
    run(() => enqueue({ ...stamp(), kind: 'list.recolor', listId, color }), "Couldn't change color");

  async function addMember() {
    const email = newEmail.trim();
    if (!email) return;
    setNewEmail('');
    await run(() => enqueue({ ...stamp(), kind: 'list.memberAdd', listId, email, role: ListRole.Editor }), "Couldn't add member");
  }

  const changeRole = (email: string, role: ListRole) =>
    run(() => enqueue({ ...stamp(), kind: 'list.memberRoleChange', listId, email, role }), "Couldn't change role");

  const removeMember = (email: string) =>
    run(() => enqueue({ ...stamp(), kind: 'list.memberRemove', listId, email }), "Couldn't remove member");

  function leave() {
    const doLeave = () =>
      run(async () => {
        await enqueue({ ...stamp(), kind: 'list.leave', listId, email: me });
        nav.popToTop();
      }, "Couldn't leave list");

    if (isOwner && ownerCount === 1) {
      Alert.alert(
        'Leave and delete list?',
        'You are the last owner — leaving deletes this list for everyone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void doLeave() },
        ],
      );
    } else {
      void doLeave();
    }
  }

  return (
    <View style={styles.fill}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>NAME</Text>
        <View style={styles.row}>
          <TextInput style={styles.input} value={name} onChangeText={setName} onSubmitEditing={saveName} returnKeyType="done" />
          <Pressable style={styles.btn} onPress={saveName}><Text style={styles.btnText}>Save</Text></Pressable>
        </View>

        <Text style={styles.section}>COLOR</Text>
        <View style={styles.swatchRow}>
          {COLORS.map((c, i) => (
            <Pressable
              key={c ?? 'none'}
              onPress={() => void setColor(c)}
              style={[
                styles.swatch,
                { backgroundColor: c ?? '#fff' },
                c === null && styles.swatchNone,
                (list.color ?? null) === c && styles.swatchSelected,
              ]}
            >
              {c === null ? <Text style={styles.swatchNoneText}>∅</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>MEMBERS</Text>
        {list.members.map(m => {
          const isMe = sameEmail(m.email, me);
          return (
            <View key={m.email} style={styles.member}>
              <View style={styles.memberHead}>
                <Text style={styles.memberEmail}>{m.email}{isMe ? ' (you)' : ''}</Text>
                {isOwner && !isMe ? (
                  <Pressable onPress={() => void removeMember(m.email)} hitSlop={8}><Text style={styles.remove}>Remove</Text></Pressable>
                ) : null}
              </View>
              {isOwner ? (
                <View style={styles.roleRow}>
                  {ROLES.map(r => (
                    <Pressable
                      key={r}
                      onPress={() => m.role !== r && void changeRole(m.email, r)}
                      style={[styles.roleChip, m.role === r && styles.roleChipOn]}
                    >
                      <Text style={[styles.roleText, m.role === r && styles.roleTextOn]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.roleLabel}>{m.role}</Text>
              )}
            </View>
          );
        })}

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Add member by email…"
            autoCapitalize="none"
            keyboardType="email-address"
            value={newEmail}
            onChangeText={setNewEmail}
            onSubmitEditing={addMember}
            returnKeyType="done"
          />
          <Pressable style={styles.btn} onPress={addMember}><Text style={styles.btnText}>Add</Text></Pressable>
        </View>

        <Pressable style={styles.leaveBtn} onPress={leave}>
          <Text style={styles.leaveText}>Leave list</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  section: { fontSize: 12, fontWeight: '700', color: '#8a909c', marginTop: 20, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d4d8e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { backgroundColor: '#1d3a5f', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  swatchRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#d4d8e0' },
  swatchNone: { alignItems: 'center', justifyContent: 'center' },
  swatchNoneText: { color: '#8a909c', fontSize: 16 },
  swatchSelected: { borderWidth: 3, borderColor: '#1d3a5f' },
  member: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e3e6ec' },
  memberHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberEmail: { fontSize: 15, flex: 1 },
  remove: { color: '#b3261e', fontSize: 13 },
  roleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: '#d4d8e0' },
  roleChipOn: { backgroundColor: '#1d3a5f', borderColor: '#1d3a5f' },
  roleText: { fontSize: 13, color: '#5b6470' },
  roleTextOn: { color: '#fff', fontWeight: '600' },
  roleLabel: { marginTop: 4, fontSize: 13, color: '#8a909c' },
  leaveBtn: { marginTop: 32, borderWidth: 1, borderColor: '#b3261e', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  leaveText: { color: '#b3261e', fontWeight: '600', fontSize: 15 },
  empty: { textAlign: 'center', color: '#8a909c', marginTop: 40 },
});
