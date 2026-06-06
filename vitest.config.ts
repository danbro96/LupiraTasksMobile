import { defineConfig } from 'vitest/config';

// Pure unit tests for the offline layer (LWW reducer, etc.). These modules are
// framework-free, so vitest runs them in a plain node environment with no Expo /
// React Native runtime. `npm run typecheck` (tsc) covers types across the project.
export default defineConfig({
  test: {
    include: ['src/offline/**/*.test.ts'],
    environment: 'node',
  },
});
