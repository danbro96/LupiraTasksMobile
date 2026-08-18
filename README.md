# Lupira Tasks (mobile)

React Native + Expo client for the Lupira Tasks API. Offline-first: a SQLite mirror of the
server read model plus a durable mutation outbox, replayed on reconnect.

## Stack

- Expo 57 / React Native 0.86 / React 19, TypeScript (strict)
- React Navigation (native stack)
- Zustand 5 (auth/session, prefs, sync status)
- `expo-sqlite` — offline mirror + outbox
- Orval — typed fetch client generated from the backend OpenAPI spec
- `expo-secure-store` for token persistence, `expo-auth-session` for OIDC (Authentik)
- Sentry (pseudonymous ids, no PII)

## Getting started

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run start
```

## Architecture

Layered, downward-only imports, enforced by `eslint-plugin-boundaries` (`eslint.config.mjs`):

```
src/
  domain/     pure logic: ops/events, LWW reducer, item tree, import/export, retry policy
  data/       SQLite (db.ts), API client (api/mutator.ts + api/generated/), OIDC helpers
  sync/       outbox enqueue/drain, pull/rebase (sync.ts), replayOp, sync status store
  state/      auth + prefs stores (register the AuthPort the lower layers read)
  ui/         screens, components, hooks, navigation, theme
  feedback/   toast + haptics (leaf, importable by anyone)
  debug/      shared debug log buffer
  config.ts   defaults (API URL, version, Sentry DSN)
```

Writes flow UI → `enqueue(op)` → one SQLite transaction (optimistic apply + outbox row) →
background drain replays to the API with an `Idempotency-Key`. Pulls write the server base into
the mirror and rebase still-pending local ops on top.

## API client

The typed client under `src/data/api/generated/` is generated from the backend OpenAPI document:

```bash
# Fetch the spec from a running server or production
npm run fetch:openapi -- https://tasks-api.lupira.com/openapi/v1.json

# Regenerate the client
npm run gen:api
```

`src/data/api/mutator.ts` (`apiFetch`) owns the base URL, bearer-token injection + reactive
refresh on 401, JSON handling, bounded transient retries, and error normalisation (`ApiError`
carries `.status`).

## Configuration

No secrets in source. The API base URL lives in `src/config.ts` (`DEFAULT_API_URL`).

## Releases

See `docs/RELEASE.md` (EAS build profiles, channels, OTA updates).
