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
 * Client: `react-query` — generates typed hooks that wrap react-query directly.
 *
 * Mutator: `./src/api/mutator.ts#apiFetch` — owns base URL, auth token, and
 * error normalisation. Reads `useAuth.getState()` at call time so the API URL
 * override (settings screen) is always picked up live.
 */
export default defineConfig({
  lupiraTasks: {
    input: { target: './backend-openapi.json' },
    output: {
      mode: 'tags-split',
      target: './src/api/generated/api.ts',
      schemas: './src/api/generated/models',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '',
      override: {
        mutator: { path: './src/api/mutator.ts', name: 'apiFetch' },
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
        },
      },
      clean: true,
    },
  },
});
