import { defineConfig } from 'vitest/config';

// Pure unit tests for the offline layer (LWW reducer, etc.) and small utils. These run in a
// plain node environment with no Expo / React Native runtime (RN-touching deps are mocked where
// needed, e.g. pendingDeletes). `npm run typecheck` (tsc) covers types across the project.
export default defineConfig({
  test: {
    include: ['src/offline/**/*.test.ts', 'src/util/**/*.test.ts', 'src/api/**/*.test.ts'],
    environment: 'node',
  },
});
