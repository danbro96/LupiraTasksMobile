import { describe, it, expect } from 'vitest';
import { bannerState } from './bannerState';

const ok = { online: true, serverReachable: true, pending: 0, failed: 0 };

describe('bannerState', () => {
  it('is hidden when online, reachable, and nothing pending/failed', () => {
    expect(bannerState(ok)).toBeNull();
  });

  it('offline takes priority over everything', () => {
    expect(bannerState({ ...ok, online: false, pending: 2, failed: 3 })).toEqual({
      kind: 'offline',
      text: 'Offline · 2 pending',
    });
    expect(bannerState({ ...ok, online: false })).toEqual({ kind: 'offline', text: 'Offline' });
  });

  it('shows unreachable when online but the server failed', () => {
    expect(bannerState({ ...ok, serverReachable: false, pending: 1 })).toEqual({
      kind: 'unreachable',
      text: "Can't reach server · 1 pending",
    });
  });

  it('shows failed count when reachable (pluralised)', () => {
    expect(bannerState({ ...ok, failed: 1 })).toEqual({ kind: 'failed', text: '1 change failed to sync' });
    expect(bannerState({ ...ok, failed: 2 })).toEqual({ kind: 'failed', text: '2 changes failed to sync' });
  });

  it('shows syncing when pending and otherwise clean', () => {
    expect(bannerState({ ...ok, pending: 1 })).toEqual({ kind: 'syncing', text: 'Syncing 1 change…' });
    expect(bannerState({ ...ok, pending: 3 })).toEqual({ kind: 'syncing', text: 'Syncing 3 changes…' });
  });

  it('prioritises unreachable over failed/syncing', () => {
    expect(bannerState({ online: true, serverReachable: false, failed: 5, pending: 2 })?.kind).toBe('unreachable');
  });
});
