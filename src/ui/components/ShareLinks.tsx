import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button as PaperButton, Card, List, Text } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { ShareAccess, type ShareDto } from '../../data/api/generated/models';
import { createShareLink, listShareLinks, revokeShareLink } from '../../data/shares';
import { toast, toastError } from '../../feedback/toast';
import { spacing, useColors, type Palette } from '../theme';
import { Button } from './Button';
import { SegmentedPicker } from './SegmentedPicker';
import { useConfirm } from './ConfirmDialog';

const ACCESS_OPTIONS: ShareAccess[] = [ShareAccess.Read, ShareAccess.ReadWrite];
const ACCESS_LABELS: Record<ShareAccess, string> = { Read: 'Read', ReadWrite: 'Read & write' };

/** Owner-only public share-link management for a list. Renders inside ListSettingsScreen. */
export function ShareLinks({ listId }: { listId: string }) {
  const confirm = useConfirm();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [shares, setShares] = useState<ShareDto[] | null>(null);
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

  async function revoke(shareId: string) {
    const ok = await confirm({
      title: 'Revoke link?',
      message: 'Anyone using this link will lose access.',
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    await revokeShareLink(listId, shareId)
      .then(() => {
        setShares(prev => (prev ?? []).filter(s => s.shareId !== shareId));
        toast('Link revoked');
      })
      .catch(() => toastError("Couldn't revoke link"));
  }

  const active = (shares ?? []).filter(s => !s.revoked);

  return (
    <View>
      <List.Subheader>SHARE LINK</List.Subheader>
      <SegmentedPicker
        options={ACCESS_OPTIONS}
        selected={access}
        onSelect={setAccess}
        getLabel={a => ACCESS_LABELS[a]}
        style={styles.access}
      />
      <Button title="Create share link" onPress={() => void create()} loading={busy} style={styles.create} />

      {shares === null ? (
        <Text variant="bodySmall" style={styles.muted}>Loading…</Text>
      ) : active.length === 0 ? (
        <Text variant="bodySmall" style={styles.muted}>No active links.</Text>
      ) : (
        active.map(s => (
          <Card key={s.shareId} mode="outlined" style={styles.link}>
            <Card.Content style={styles.linkBody}>
              <Text variant="bodySmall" numberOfLines={1} ellipsizeMode="middle">
                {s.url}
              </Text>
              <Text variant="bodySmall" style={styles.accessLabel}>{ACCESS_LABELS[s.access]}</Text>
            </Card.Content>
            <Card.Actions>
              <PaperButton onPress={() => void copy(s.url)} accessibilityLabel="Copy link">
                Copy
              </PaperButton>
              <PaperButton textColor={c.danger} onPress={() => void revoke(s.shareId)} accessibilityLabel="Revoke link">
                Revoke
              </PaperButton>
            </Card.Actions>
          </Card>
        ))
      )}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    access: { marginBottom: spacing.md },
    create: {},
    muted: { marginTop: spacing.md, color: c.textSubtle },
    link: { marginTop: spacing.md },
    linkBody: { gap: spacing.sm },
    accessLabel: { color: c.textMuted },
  });
