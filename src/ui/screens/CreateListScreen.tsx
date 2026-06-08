import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListKind } from '../../data/api/generated/models';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { ColorSwatches } from '../components/ColorSwatches';
import { SyncBanner } from '../components/SyncBanner';
import { toast } from '../../feedback/toast';
import { enqueue } from '../../sync/outbox';
import { newId, stamp } from '../../domain/ops';
import { logDebug } from '../../debug/log';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';

const KINDS: { kind: ListKind; label: string }[] = [
  { kind: ListKind.Todo, label: 'To-do' },
  { kind: ListKind.Shopping, label: 'Shopping' },
];

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
      toast('Name cannot be empty');
      return;
    }
    try {
      await enqueue({ ...stamp(), kind: 'list.create', listId: newId(), name: n, listKind: kind, color });
      nav.goBack();
    } catch (e) {
      toast("Couldn't create list");
      logDebug('createList:error', e instanceof Error ? e.message : String(e));
    }
  }

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
          onSubmitEditing={create}
          accessibilityLabel="List name"
        />

        <Text style={styles.section}>TYPE</Text>
        <View style={styles.chipRow}>
          {KINDS.map(k => {
            const on = kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                onPress={() => setKind(k.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>COLOR</Text>
        <ColorSwatches value={color} onChange={setColor} />

        <Button title="Create list" onPress={create} disabled={!name.trim()} style={styles.create} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, paddingBottom: 48 },
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    chip: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: c.border },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 14, color: c.textMuted },
    chipTextOn: { color: c.onPrimary, fontWeight: '600' },
    create: { marginTop: spacing.xxl },
  });
};
