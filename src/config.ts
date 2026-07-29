// Lupira Tasks defaults — overrideable from the in-app settings screen so dev
// builds can point at localhost without rebuilding.
export const DEFAULT_API_URL = 'https://tasks-api.lupira.com';

// How often an open list re-pulls from the server while its screen is focused and the app is
// foregrounded, so another member's edits appear without a manual pull-to-refresh. 0 disables it.
export const LIST_POLL_MS = 5_000;

// Human-readable app version, shown on the Account screen. Keep in sync with app.json's
// `expo.version` (no expo-constants/expo-application dependency, so this is set by hand).
export const APP_VERSION = '1.3.0';

// Sentry DSN — a public client (ingest) key, safe to commit. Empty disables crash
// reporting. The CLI auth token (for source-map upload) is the secret one and lives in
// .env.local / sentry.properties (git-ignored) and the EAS `SENTRY_AUTH_TOKEN` secret.
export const SENTRY_DSN = 'https://3843e53f862b5ccf98db1b15c0b2b573@o4511341575733248.ingest.de.sentry.io/4511524276863056';
