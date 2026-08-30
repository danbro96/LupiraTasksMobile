/** 'dev' = this backend's bypass; here that means an `X-Dev-User` header. */
export type AuthMode = 'oidc' | 'dev';

/** `urls.api` is the primary origin; multi-backend apps add keys. */
export type ApiPreset = {
  key: string;
  label: string;
  urls: { api: string } & Record<string, string>;
  authMode: AuthMode;
};

export const API_PRESETS: ApiPreset[] = [
  { key: 'prod', label: 'Production', urls: { api: 'https://tasks-api.lupira.com' }, authMode: 'oidc' },
  { key: 'lan', label: 'LAN dev', urls: { api: 'http://192.168.14.108:8080' }, authMode: 'dev' },
  { key: 'emulator', label: 'Emulator dev', urls: { api: 'http://10.0.2.2:8080' }, authMode: 'dev' },
];

/** tasks-api trusts X-Dev-User only in Development. */
export const DEV_USER = 'daniel.brostrom@hotmail.se';

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? API_PRESETS[0].urls.api;
export const DEFAULT_AUTH_MODE: AuthMode =
  (process.env.EXPO_PUBLIC_AUTH_MODE as AuthMode | undefined)
  ?? (process.env.EXPO_PUBLIC_API_URL ? 'dev' : 'oidc');

// How often an open list re-pulls from the server while its screen is focused and the app is
// foregrounded, so another member's edits appear without a manual pull-to-refresh. 0 disables it.
export const LIST_POLL_MS = 5_000;

// Human-readable app version, shown on the Settings screen. Keep in sync with app.json's
// `expo.version` (no expo-constants/expo-application dependency, so this is set by hand).
export const APP_VERSION = '1.3.0';

// Sentry DSN — a public client (ingest) key, safe to commit. Empty disables crash
// reporting. The CLI auth token (for source-map upload) is the secret one and lives in
// .env.local / sentry.properties (git-ignored) and the EAS `SENTRY_AUTH_TOKEN` secret.
export const SENTRY_DSN = 'https://3843e53f862b5ccf98db1b15c0b2b573@o4511341575733248.ingest.de.sentry.io/4511524276863056';

/** Extra screens the Developer screen links to. */
export const DIAGNOSTIC_ROUTES: { route: string; label: string }[] = [
  { route: 'DebugLog', label: 'Debug log' },
  { route: 'SyncIssues', label: 'Sync issues' },
];
