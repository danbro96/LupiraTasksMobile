import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API_URL } from '../config';
import { refreshTokens } from '../auth/oidc';
import { useSyncStatus } from '../offline/syncStatus';

const KEY_API_URL = 'lupira.tasks.apiUrl';
const KEY_TOKEN = 'lupira.tasks.token';
const KEY_REFRESH = 'lupira.tasks.refreshToken';
const KEY_EXPIRES = 'lupira.tasks.expiresAt';
const KEY_USER_SUB = 'lupira.tasks.userSub';
const KEY_USER_NAME = 'lupira.tasks.userName';

export type AuthUser = {
  /** The caller's email (= OIDC subject convention; used as the actor + identity). */
  sub: string;
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
  /** Merge server profile fields (from `/me`) into the cached user; persists displayName. */
  updateProfile: (profile: { displayName?: string | null; isAdmin?: boolean }) => Promise<void>;
  clearSession: () => Promise<void>;
  /** Refresh the access token if it's expired/near-expiry; returns the live access token. */
  refreshIfNeeded: () => Promise<string | null>;
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
    const [apiUrl, token, refreshToken, expiresAt, userSub, userName] = await Promise.all([
      SecureStore.getItemAsync(KEY_API_URL),
      SecureStore.getItemAsync(KEY_TOKEN),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_EXPIRES),
      SecureStore.getItemAsync(KEY_USER_SUB),
      SecureStore.getItemAsync(KEY_USER_NAME),
    ]);
    set({
      loaded: true,
      apiUrl: apiUrl || DEFAULT_API_URL,
      token: token ?? null,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ? Number(expiresAt) : null,
      user: userSub ? { sub: userSub, displayName: userName ?? undefined } : null,
    });
  },

  setApiUrl: async apiUrl => {
    await SecureStore.setItemAsync(KEY_API_URL, apiUrl);
    set({ apiUrl });
  },

  setSession: async (session, user) => {
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
    ]);
    set({
      token: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      expiresAt: session.expiresAt,
      user,
    });
  },

  updateProfile: async ({ displayName, isAdmin }) => {
    const cur = get().user;
    if (!cur) return;
    if (displayName !== undefined) {
      if (displayName) await SecureStore.setItemAsync(KEY_USER_NAME, displayName);
      else await SecureStore.deleteItemAsync(KEY_USER_NAME);
    }
    set({
      user: {
        ...cur,
        displayName: displayName === undefined ? cur.displayName : (displayName ?? undefined),
        isAdmin: isAdmin === undefined ? cur.isAdmin : isAdmin,
      },
    });
  },

  clearSession: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_TOKEN),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_EXPIRES),
      SecureStore.deleteItemAsync(KEY_USER_SUB),
      SecureStore.deleteItemAsync(KEY_USER_NAME),
    ]);
    set({ token: null, refreshToken: null, expiresAt: null, user: null });
    // Next signed-in user starts fresh: show the initial-load spinner until their first sync.
    useSyncStatus.getState().setFirstSyncDone(false);
  },

  refreshIfNeeded: async () => {
    const { token, refreshToken, expiresAt, user } = get();
    if (!token) return null;
    const fresh = expiresAt ? Date.now() < expiresAt - 60_000 : false;
    if (fresh || !refreshToken || !user) return token;
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
    } catch {
      // Refresh failed (revoked/expired) — drop the session so the user re-authenticates.
      await get().clearSession();
      return null;
    }
  },

  isAuthenticated: () => !!get().token && !!get().user,
}));
