# Lupira Tasks (mobile)

React Native + Expo client for the Lupira Tasks API.

## Stack

- Expo 55 / React Native 0.83 / React 19
- TypeScript (strict)
- React Navigation (native stack)
- TanStack React Query v5
- Zustand 5 for client state (auth/session)
- Orval — generates a typed React Query client from the backend OpenAPI spec
- `expo-secure-store` for token persistence
- Offline support libraries staged for a later phase: `expo-sqlite`,
  `@react-native-community/netinfo`, `uuid`

## Getting started

```bash
npm install
npm run typecheck
npm run start
```

## API client

The typed client under `src/api/generated/` is generated from the backend
OpenAPI document. Refresh and regenerate with:

```bash
# Fetch the spec from a running server or production
npm run fetch:openapi -- https://tasks-api.lupira.com/openapi/v1.json

# Regenerate the React Query hooks
npm run gen:api
```

`src/api/mutator.ts` (`apiFetch`) owns the base URL, bearer-token injection,
JSON handling, and error normalisation (`ApiError` carries `.status`). The base
URL is read live from the auth store so an in-app override is always honoured.

## Configuration

No secrets in source. The default API URL lives in `src/config.ts`
(`DEFAULT_API_URL`) and is overrideable at runtime via the auth store
(`setApiUrl`), which persists to secure storage.

## Layout

```
src/
  api/         apiFetch mutator, hand types, generated client (gen:api output)
  navigation/  root stack + typed param lists
  offline/     reserved for SQLite store / outbox / sync (later phase)
  query/       React Query client
  screens/     UI screens
  store/       Zustand stores (auth/session)
  config.ts    defaults (API URL)
```
