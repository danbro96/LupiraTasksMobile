import { defineConfig } from 'vitest/config';

// Pure unit tests for the domain layer (LWW reducer, retry policy, etc.) and the thin data/state
// seams (mutator, auth store). These run in a plain node environment with no Expo / React Native
// runtime (RN-touching deps are mocked where needed). `npm run typecheck` (tsc) covers types
// across the project. Tests are co-located with the code they cover, so a single glob suffices.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
