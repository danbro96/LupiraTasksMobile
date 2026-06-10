import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store touches native modules that don't load in the node test env — mock them down to the
// behaviour under test. RefreshError is re-created here (same shape) so the store's `instanceof`
// check still discriminates definitive vs transient failures.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../feedback/toast', () => ({ toast: vi.fn() }));
vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));
vi.mock('expo-crypto', () => ({
  digestStringAsync: vi.fn().mockResolvedValue('hashed-id'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
vi.mock('@sentry/react-native', () => ({
  setUser: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));
vi.mock('../data/auth/oidc', () => {
  class RefreshError extends Error {
    definitive: boolean;
    constructor(definitive: boolean, message: string) {
      super(message);
      this.definitive = definitive;
      this.name = 'RefreshError';
    }
  }
  return { RefreshError, refreshTokens: vi.fn() };
});

import * as SecureStore from 'expo-secure-store';
import { useAuth } from './auth-store';
import { refreshTokens, RefreshError } from '../data/auth/oidc';
import { toast } from '../feedback/toast';

const refreshMock = refreshTokens as unknown as ReturnType<typeof vi.fn>;
const toastMock = toast as unknown as ReturnType<typeof vi.fn>;
const setItemMock = SecureStore.setItemAsync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.setState({
    loaded: true,
    apiUrl: 'https://api.test',
    token: 'tok-1',
    refreshToken: 'ref-1',
    expiresAt: Date.now() + 3_600_000, // comfortably fresh
    user: { sub: 'u@example.com' },
  });
});

describe('refreshIfNeeded', () => {
  it('returns the current token without refreshing while it is fresh', async () => {
    const t = await useAuth.getState().refreshIfNeeded();
    expect(t).toBe('tok-1');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('force refreshes even when fresh, and adopts the new token', async () => {
    refreshMock.mockResolvedValue({ accessToken: 'tok-2', refreshToken: 'ref-2', expiresIn: 3600 });
    const t = await useAuth.getState().refreshIfNeeded({ force: true });
    expect(t).toBe('tok-2');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(useAuth.getState().token).toBe('tok-2');
  });

  it('force with no refresh token clears the session and notifies', async () => {
    useAuth.setState({ refreshToken: null });
    const t = await useAuth.getState().refreshIfNeeded({ force: true });
    expect(t).toBeNull();
    expect(useAuth.getState().token).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith('Session expired — please sign in again.');
  });

  it('force with no user clears the session', async () => {
    useAuth.setState({ user: null });
    const t = await useAuth.getState().refreshIfNeeded({ force: true });
    expect(t).toBeNull();
    expect(useAuth.getState().token).toBeNull();
  });

  it('a definitive refresh failure clears the session and notifies', async () => {
    refreshMock.mockRejectedValue(new RefreshError(true, 'refresh 400'));
    const t = await useAuth.getState().refreshIfNeeded({ force: true });
    expect(t).toBeNull();
    expect(useAuth.getState().token).toBeNull();
    expect(toastMock).toHaveBeenCalledWith('Session expired — please sign in again.');
  });

  it('a transient refresh failure keeps the session and returns the current token', async () => {
    refreshMock.mockRejectedValue(new RefreshError(false, 'network'));
    const t = await useAuth.getState().refreshIfNeeded({ force: true });
    expect(t).toBe('tok-1');
    expect(useAuth.getState().token).toBe('tok-1');
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('coalesces concurrent forced refreshes into a single POST', async () => {
    refreshMock.mockResolvedValue({ accessToken: 'tok-2', refreshToken: 'ref-2', expiresIn: 3600 });
    const [a, b] = await Promise.all([
      useAuth.getState().refreshIfNeeded({ force: true }),
      useAuth.getState().refreshIfNeeded({ force: true }),
    ]);
    expect(a).toBe('tok-2');
    expect(b).toBe('tok-2');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the current token if the refresh response carries no access token', async () => {
    refreshMock.mockResolvedValue({ accessToken: '' });
    const t = await useAuth.getState().refreshIfNeeded({ force: true });
    expect(t).toBe('tok-1');
    expect(useAuth.getState().token).toBe('tok-1');
  });

  it('forced refresh is skipped when the session token already moved past sentToken', async () => {
    // The 401'd request sent tok-0; another caller has since refreshed to tok-1. Rotating again
    // would risk reuse detection — hand back the current token instead.
    const t = await useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'tok-0' });
    expect(t).toBe('tok-1');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('forced refresh still POSTs when sentToken matches the current token', async () => {
    refreshMock.mockResolvedValue({ accessToken: 'tok-2', refreshToken: 'ref-2', expiresIn: 3600 });
    const t = await useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'tok-1' });
    expect(t).toBe('tok-2');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe('setSession', () => {
  it('keeps the in-memory session when persistence fails (rotated token must not be lost)', async () => {
    setItemMock.mockRejectedValue(new Error('keystore unavailable'));
    await expect(
      useAuth.getState().setSession(
        { accessToken: 'tok-2', refreshToken: 'ref-2', expiresAt: Date.now() + 3_600_000 },
        { sub: 'u@example.com' },
      ),
    ).resolves.toBeUndefined();
    expect(useAuth.getState().token).toBe('tok-2');
    expect(useAuth.getState().refreshToken).toBe('ref-2');
  });
});

describe('clearSession', () => {
  it('surfaces a toast only for an expired reason', async () => {
    await useAuth.getState().clearSession({ reason: 'expired' });
    expect(toastMock).toHaveBeenCalledTimes(1);

    toastMock.mockClear();
    await useAuth.getState().clearSession();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
