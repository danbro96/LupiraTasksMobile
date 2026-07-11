import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Sentry from '@sentry/react-native';
import { DEFAULT_API_URL } from '../config';
import { setAuthPort } from '../data/api/authProvider';
import { refreshTokens, RefreshError } from '../data/auth/oidc';
import { useSyncStatus } from '../sync/syncStatus';
import { toast } from '../feedback/toast';
import { logDebug } from '../debug/log';

// One shared in-flight refresh. Concurrent callers await it instead of each POSTing the
// refresh token (mirrors the syncing/draining guards). See refreshIfNeeded for why.
let refreshing: Promise<string | null> | null = null;

/**
 * Attach a PSEUDONYMOUS Sentry identity so events can be correlated per-user without storing the
 * raw email (sendDefaultPii is false). The id is a SHA-256 hash of the email; null clears it.
 * Fire-and-forget — events fired before the hash resolves just lack the id.
 */
async function setSentryUser(email: string | null): Promise<void> {
  if (!email) {
    Sentry.setUser(null);
    return;
  }
  try {
    const id = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email);
    Sentry.setUser({ id });
  } catch {
    // Hashing failed (unlikely) — leave the identity unset rather than risk leaking the email.
  }
}

const KEY_API_URL = 'lupira.tasks.apiUrl';
const KEY_TOKEN = 'lupira.tasks.token';
const KEY_REFRESH = 'lupira.tasks.refreshToken';
const KEY_EXPIRES = 'lupira.tasks.expiresAt';
const KEY_USER_SUB = 'lupira.tasks.userSub';
const KEY_USER_NAME = 'lupira.tasks.userName';
const KEY_USER_PRINCIPAL = 'lupira.tasks.userPrincipalId';

export type AuthUser = {
  /** The caller's email (= OIDC subject convention; used for display + invite dedup + Sentry hash). */
  sub: string;
  /** The caller's internal principal id — the actor for optimistic apply. From `/me`; absent until
   *  the first profile pull (the JWT carries no principal claim). */
  principalId?: string;
  displayName?: string;
  /** From the server `/me` profile; in-memory only (re-fetched each launch). */
  isAdmin?: boolean;
};

export type Session = {
  accessToken: string;
  refreshToken?: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
};

type AuthState = {
  loaded: boolean;
  apiUrl: string;
  token: string | null; // access token — read by the api mutator
  refreshToken: string | null;
  expiresAt: number | null;
  user: AuthUser | null;
};

type AuthActions = {
  load: () => Promise<void>;
  setApiUrl: (apiUrl: string) => Promise<void>;
  setSession: (session: Session, user: AuthUser) => Promise<void>;
  /** Merge server profile fields (from `/me`) into the cached user; persists displayName + principalId. */
  updateProfile: (profile: { principalId?: string; displayName?: string | null; isAdmin?: boolean }) => Promise<void>;
  /** Wipe the session. `reason: 'expired'` surfaces a toast (involuntary logout); a plain
   *  call (deliberate sign-out) stays silent. */
  clearSession: (opts?: { reason?: 'expired' }) => Promise<void>;
  /** Refresh the access token if it's expired/near-expiry; returns the live access token.
   *  `force: true` bypasses the freshness check (reactive refresh after a server 401) and, when
   *  the session is definitively un-refreshable, clears it rather than handing back a dead token.
   *  `sentToken` (forced callers) is the token the 401'd request sent — if the session token has
   *  already changed since, the refresh is skipped and the current token returned. */
  refreshIfNeeded: (opts?: { force?: boolean; sentToken?: string }) => Promise<string | null>;
  isAuthenticated: () => boolean;
};

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  loaded: false,
  apiUrl: DEFAULT_API_URL,
  token: null,
  refreshToken: null,
  expiresAt: null,
  user: null,

  load: async () => {
    const [apiUrl, token, refreshToken, expiresAt, userSub, userName, userPrincipal] = await Promise.all([
      SecureStore.getItemAsync(KEY_API_URL),
      SecureStore.getItemAsync(KEY_TOKEN),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_EXPIRES),
      SecureStore.getItemAsync(KEY_USER_SUB),
      SecureStore.getItemAsync(KEY_USER_NAME),
      SecureStore.getItemAsync(KEY_USER_PRINCIPAL),
    ]);
    set({
      loaded: true,
      apiUrl: apiUrl || DEFAULT_API_URL,
      token: token ?? null,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ? Number(expiresAt) : null,
      user: userSub ? { sub: userSub, displayName: userName ?? undefined, principalId: userPrincipal ?? undefined } : null,
    });
    void setSentryUser(userSub ?? null);
  },

  setApiUrl: async apiUrl => {
    await SecureStore.setItemAsync(KEY_API_URL, apiUrl);
    set({ apiUrl });
  },

  setSession: async (session, user) => {
    // In-memory state first: a rotated refresh token must survive even if persistence fails —
    // the old one is already invalid server-side, so losing the new one here would strand the
    // session (the next refresh would replay a dead token → definitive 400 → forced logout).
    set({
      token: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      expiresAt: session.expiresAt,
      user,
    });
    void setSentryUser(user.sub);
    try {
      await Promise.all([
        SecureStore.setItemAsync(KEY_TOKEN, session.accessToken),
        session.refreshToken
          ? SecureStore.setItemAsync(KEY_REFRESH, session.refreshToken)
          : SecureStore.deleteItemAsync(KEY_REFRESH),
        SecureStore.setItemAsync(KEY_EXPIRES, String(session.expiresAt)),
        SecureStore.setItemAsync(KEY_USER_SUB, user.sub),
        user.displayName
          ? SecureStore.setItemAsync(KEY_USER_NAME, user.displayName)
          : SecureStore.deleteItemAsync(KEY_USER_NAME),
        user.principalId
          ? SecureStore.setItemAsync(KEY_USER_PRINCIPAL, user.principalId)
          : SecureStore.deleteItemAsync(KEY_USER_PRINCIPAL),
      ]);
    } catch (e) {
      // The live session is intact in memory; only the persisted copy is stale. A restart could
      // replay an already-rotated refresh token, so leave a trace.
      logDebug('auth:persist-error', e instanceof Error ? e.message : String(e));
    }
  },

  updateProfile: async ({ principalId, displayName, isAdmin }) => {
    const cur = get().user;
    if (!cur) return;
    if (displayName !== undefined) {
      if (displayName) await SecureStore.setItemAsync(KEY_USER_NAME, displayName);
      else await SecureStore.deleteItemAsync(KEY_USER_NAME);
    }
    if (principalId) await SecureStore.setItemAsync(KEY_USER_PRINCIPAL, principalId);
    set({
      user: {
        ...cur,
        principalId: principalId ?? cur.principalId,
        displayName: displayName === undefined ? cur.displayName : (displayName ?? undefined),
        isAdmin: isAdmin === undefined ? cur.isAdmin : isAdmin,
      },
    });
  },

  clearSession: async opts => {
    // Involuntary logout (expired/revoked session) tells the user why before the screen flips to
    // the sign-in view; a deliberate sign-out passes no reason and stays silent.
    if (opts?.reason === 'expired') toast('Session expired — please sign in again.');
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_TOKEN),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_EXPIRES),
      SecureStore.deleteItemAsync(KEY_USER_SUB),
      SecureStore.deleteItemAsync(KEY_USER_NAME),
      SecureStore.deleteItemAsync(KEY_USER_PRINCIPAL),
    ]);
    set({ token: null, refreshToken: null, expiresAt: null, user: null });
    Sentry.setUser(null);
    // Next signed-in user starts fresh: show the initial-load spinner until their first sync.
    useSyncStatus.getState().setFirstSyncDone(false);
  },

  refreshIfNeeded: async opts => {
    const { token, refreshToken, expiresAt, user } = get();
    if (!token) return null;
    const force = opts?.force ?? false;
    // A forced caller reports the token its 401'd request actually sent; if the session has
    // already moved past it (another caller refreshed in the meantime), hand back the current
    // token instead of rotating again — every extra rotation risks tripping reuse detection.
    if (force && opts?.sentToken && opts.sentToken !== token) return token;
    const fresh = expiresAt ? Date.now() < expiresAt - 60_000 : false;
    // Proactive callers stand pat while the token is still fresh; a forced (post-401) caller
    // always attempts a refresh.
    if (!force && fresh) return token;
    if (!refreshToken || !user) {
      // No way to refresh. A forced caller reached here because the server already rejected the
      // token (401), so the session is definitively dead — clear it for re-auth. A proactive
      // caller keeps the (possibly still-valid) token and lets any later 401 trigger the force path.
      if (force) {
        logDebug('auth:logout', refreshToken ? 'forced refresh with no user' : 'forced refresh with no refresh token');
        await get().clearSession({ reason: 'expired' });
        return null;
      }
      logDebug('refresh:no-refresh-token', 'keeping stale access token');
      return token;
    }
    // Coalesce concurrent refreshes: an enqueue-triggered drain firing while a foreground
    // sync is already mid-refresh must NOT POST the refresh token a second time — with
    // Authentik rotation the second send replays an already-rotated token, which fails and
    // forces an unexpected logout. The first caller owns the request; the rest await it.
    if (refreshing) return refreshing;
    refreshing = (async (): Promise<string | null> => {
      try {
        const t = await refreshTokens(refreshToken);
        if (!t.accessToken) return token;
        const next: Session = {
          accessToken: t.accessToken,
          refreshToken: t.refreshToken ?? refreshToken,
          expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000,
        };
        await get().setSession(next, user);
        return next.accessToken;
      } catch (e) {
        // Definitive rejection (refresh token/client invalid) — drop the session to re-auth.
        if (e instanceof RefreshError && e.definitive) {
          // Rare + high-signal (the user is being forced to sign in again) — worth a Sentry event.
          logDebug('auth:logout', `definitive: ${e.message}`);
          Sentry.captureMessage(`auth: definitive refresh failure — ${e.message}`, 'warning');
          await get().clearSession({ reason: 'expired' });
          return null;
        }
        // Transient (network/timeout/5xx): keep the session and retry on the next trigger. Return
        // the current token best-effort — it may still be valid within the 60s margin; if expired,
        // downstream 401s are handled by the outbox / runSync. A blip must not log the user out.
        logDebug('refresh:transient', e instanceof Error ? e.message : String(e));
        return token;
      }
    })().finally(() => { refreshing = null; });
    return refreshing;
  },

  isAuthenticated: () => !!get().token && !!get().user,
}));

// Register the auth capabilities the lower layers (API mutator, offline sync/outbox) depend on,
// so they read the live session through the AuthPort instead of importing this store upward. Runs
// at module load — App.tsx imports the store during bootstrap, before any request can fire.
setAuthPort({
  getApiUrl: () => useAuth.getState().apiUrl,
  getToken: () => useAuth.getState().token,
  getActor: () => useAuth.getState().user?.principalId ?? null,
  getSelf: () => {
    const u = useAuth.getState().user;
    return u?.principalId ? { principalId: u.principalId, email: u.sub, displayName: u.displayName ?? null } : null;
  },
  refresh: (force, sentToken) => useAuth.getState().refreshIfNeeded({ force, sentToken }),
  applyProfile: profile => useAuth.getState().updateProfile(profile),
  onSignIn: cb => useAuth.subscribe((state, prev) => { if (!prev.token && state.token) cb(); }),
});
