import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ShareAccess, type ShareResponse } from '../../data/api/generated/models';
import { createShareLink, listShareLinks, revokeShareLink } from '../../data/shares';
import { toast, toastError } from '../../feedback/toast';
import { makeType, radii, spacing, useColors, type Palette } from '../theme';
import { Button } from './Button';
import { ChipRow } from './ChipRow';

const ACCESS_OPTIONS: ShareAccess[] = [ShareAccess.Read, ShareAccess.ReadWrite];
const ACCESS_LABELS: Record<ShareAccess, string> = { Read: 'Read', ReadWrite: 'Read & write' };

/** Owner-only public share-link management for a list. Renders inside ListSettingsScreen. */
export function ShareLinks({ listId }: { listId: string }) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [shares, setShares] = useState<ShareResponse[] | null>(null);
  const [access, setAccess] = useState<ShareAccess>(ShareAccess.Read);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listShareLinks(listId)
      .then(s => alive && setShares(s))
      .catch(() => {
        if (!alive) return;
        setShares([]);
        toastError("Couldn't load share links");
      });
    return () => {
      alive = false;
    };
  }, [listId]);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const share = await createShareLink(listId, access);
      setShares(prev => [share, ...(prev ?? [])]);
      await Clipboard.setStringAsync(share.url);
      toast('Link created & copied');
    } catch {
      toastError("Couldn't create share link");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    await Clipboard.setStringAsync(url);
    toast('Link copied');
  }

  function revoke(shareId: string) {
    Alert.alert('Revoke link?', 'Anyone using this link will lose access.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () => {
          void revokeShareLink(listId, shareId)
            .then(() => {
              setShares(prev => (prev ?? []).filter(s => s.shareId !== shareId));
              toast('Link revoked');
            })
            .catch(() => toastError("Couldn't revoke link"));
        },
      },
    ]);
  }

  const active = (shares ?? []).filter(s => !s.revoked);

  return (
    <View>
      <Text style={styles.section}>SHARE LINK</Text>
      <ChipRow
        options={ACCESS_OPTIONS}
        selected={access}
        onSelect={setAccess}
        getLabel={a => ACCESS_LABELS[a]}
        style={styles.access}
      />
      <Button title="Create share link" onPress={() => void create()} loading={busy} style={styles.create} />

      {shares === null ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : active.length === 0 ? (
        <Text style={styles.muted}>No active links.</Text>
      ) : (
        active.map(s => (
          <View key={s.shareId} style={styles.link}>
            <Text style={styles.url} numberOfLines={1} ellipsizeMode="middle">
              {s.url}
            </Text>
            <View style={styles.linkFoot}>
              <Text style={styles.accessLabel}>{ACCESS_LABELS[s.access]}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => void copy(s.url)} accessibilityRole="button" accessibilityLabel="Copy link">
                  <Text style={styles.copy}>Copy</Text>
                </Pressable>
                <Pressable onPress={() => revoke(s.shareId)} accessibilityRole="button" accessibilityLabel="Revoke link">
                  <Text style={styles.revoke}>Revoke</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => {
  const t = makeType(c);
  return StyleSheet.create({
    section: { ...t.sectionLabel, marginTop: spacing.xl, marginBottom: spacing.sm },
    access: { marginBottom: spacing.md },
    create: {},
    muted: { ...t.small, marginTop: spacing.md, color: c.textSubtle },
    link: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      gap: spacing.sm,
    },
    url: { fontSize: 13, color: c.text },
    linkFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    accessLabel: { ...t.small },
    actions: { flexDirection: 'row', gap: spacing.lg },
    copy: { color: c.primary, fontSize: 13, fontWeight: '600' },
    revoke: { color: c.danger, fontSize: 13, fontWeight: '600' },
  });
};
