// Pure derivation of the sync banner from the status store, kept framework-free so it can be
// unit-tested. Priority: connectivity → server reachability → failed changes → in-progress sync
// → last sync error.

export interface BannerInput {
  online: boolean;
  serverReachable: boolean;
  pending: number;
  failed: number;
  /** Last sync/replay error message; surfaces a generic error banner when nothing higher applies. */
  lastError: string | null;
}

export type BannerKind = 'offline' | 'unreachable' | 'failed' | 'syncing' | 'error';

export interface BannerState {
  kind: BannerKind;
  text: string;
}

const plural = (n: number) => (n === 1 ? '' : 's');

export function bannerState(s: BannerInput): BannerState | null {
  if (!s.online) {
    return { kind: 'offline', text: s.pending > 0 ? `Offline · ${s.pending} pending` : 'Offline' };
  }
  if (!s.serverReachable) {
    return {
      kind: 'unreachable',
      text: s.pending > 0 ? `Can't reach server · ${s.pending} pending` : "Can't reach server",
    };
  }
  if (s.failed > 0) {
    return { kind: 'failed', text: `${s.failed} change${plural(s.failed)} failed to sync` };
  }
  if (s.pending > 0) {
    return { kind: 'syncing', text: `Syncing ${s.pending} change${plural(s.pending)}…` };
  }
  // Lowest priority: a sync attempt failed for a reason that isn't offline/unreachable/parked
  // (e.g. a 5xx while pulling) and left nothing pending — surface it so it isn't invisible.
  if (s.lastError) {
    return { kind: 'error', text: 'Sync failed — pull to retry' };
  }
  return null;
}
