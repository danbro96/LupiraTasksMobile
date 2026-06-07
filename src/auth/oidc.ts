import * as AuthSession from 'expo-auth-session';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from './oidcConfig';
import { logAuth } from './authDebug';

// Non-hook OIDC helpers (the interactive login itself lives in LoginScreen via
// expo-auth-session's useAuthRequest). Discovery is fetched once and cached.

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

/**
 * Exchange an authorization code for tokens with a manual fetch (PKCE public client) so the
 * raw HTTP status + body are visible in the auth trace — expo-auth-session's exchangeCodeAsync
 * hides them and surfaces only "JSON Parse error" when the token endpoint returns a non-JSON
 * or empty body.
 */
export async function exchangeAuthCode(params: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: OIDC_CLIENT_ID,
  });
  if (params.codeVerifier) body.append('code_verifier', params.codeVerifier);

  logAuth('token:post', params.tokenEndpoint);
  const res = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await res.text();
  logAuth('token:response', `status=${res.status} len=${text.length} body=${text.slice(0, 400)}`);
  if (!res.ok) throw new Error(`token ${res.status}: ${text.slice(0, 400)}`);
  if (!text) throw new Error(`token ${res.status}: empty body`);

  const json = JSON.parse(text) as {
    access_token: string; refresh_token?: string; id_token?: string; expires_in?: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    expiresIn: json.expires_in,
  };
}

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
