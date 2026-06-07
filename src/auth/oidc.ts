import * as AuthSession from 'expo-auth-session';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from './oidcConfig';

// Non-hook OIDC helpers (the interactive login itself lives in LoginScreen via
// expo-auth-session's useAuthRequest). Discovery is fetched once and cached.

let discoveryPromise: Promise<AuthSession.DiscoveryDocument> | null = null;

export function getDiscovery(): Promise<AuthSession.DiscoveryDocument> {
  if (!discoveryPromise) discoveryPromise = AuthSession.fetchDiscoveryAsync(OIDC_ISSUER);
  return discoveryPromise;
}

/** Exchange a refresh token for a fresh access token (+ rotated refresh token). */
export async function refreshTokens(refreshToken: string): Promise<AuthSession.TokenResponse> {
  const discovery = await getDiscovery();
  return AuthSession.refreshAsync({ clientId: OIDC_CLIENT_ID, refreshToken }, discovery);
}

/** Decode a JWT payload (no signature check — the server verifies; this is for claims only). */
export function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) return {};
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    const bytes = globalThis.atob(b64);
    const json = decodeURIComponent(
      Array.prototype.map.call(bytes, (c: string) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
