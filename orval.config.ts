import { defineConfig } from 'orval';

/**
 * Orval config for the Lupira Tasks backend.
 *
 * Source spec: `./backend-openapi.json` — refreshed by `npm run fetch:openapi`,
 * which copies the spec emitted by the backend (or fetched from a running
 * server / production URL).
 *
 * Output mode: `tags-split` — one file per OpenAPI tag, giving cleaner imports
 * and tighter PR diffs.
 *
 * Client: `fetch` — generates plain typed fetch functions (no react-query hooks). The app
 * reads through the offline SQLite mirror and calls these raw fetchers directly from the
 * sync/outbox layer, so react-query's cache is unused; keeping it out avoids a second,
 * mirror-unaware cache and a redundant dependency.
 *
 * Mutator: `./src/data/api/mutator.ts#apiFetch` — owns base URL, auth token, and
 * error normalisation. Reads the session through the AuthPort at call time so the API URL
 * override (settings screen) is always picked up live.
 */
export default defineConfig({
  lupiraTasks: {
    input: { target: './backend-openapi.json' },
    output: {
      mode: 'tags-split',
      target: './src/data/api/generated/api.ts',
      schemas: './src/data/api/generated/models',
      client: 'fetch',
      baseUrl: '',
      override: {
        mutator: { path: './src/data/api/mutator.ts', name: 'apiFetch' },
      },
      clean: true,
    },
  },
});
