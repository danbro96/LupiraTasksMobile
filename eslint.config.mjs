import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v6 object-selector helper: `to('domain','generated')` → [{ to: { type: 'domain' } }, …]. */
const to = (...types) => types.map((t) => ({ to: { type: t } }));

// Lint config focused on ONE thing: enforcing the layered architecture (see ARCHITECTURE / the
// plan). It is deliberately NOT a style overhaul — only the import-boundary rule is on, so it acts
// as a structural gate. Broader rule sets (eslint-config-expo, type-aware rules) can be layered in
// later. The dependency rule is downward-only: domain → nothing (but the generated DTO *types*);
// data → domain; sync → data/domain; state → sync/…; ui → everything; the cross-cutting leaves
// (feedback/toast, debug/log, config) may be imported by anyone but import no app layer themselves.
export default [
  {
    ignores: [
      'node_modules/**',
      'src/data/api/generated/**', // orval-generated client — not hand-authored
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      // Map each folder to a layer "element". Order matters: `generated` is listed before `data`
      // so the generated subtree is classified as its own (importable-by-anyone) element.
      'boundaries/elements': [
        { type: 'generated', pattern: 'src/data/api/generated/**' },
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'data', pattern: 'src/data/**' },
        { type: 'sync', pattern: 'src/sync/**' },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'feedback', pattern: 'src/feedback/**' },
        { type: 'debug', pattern: 'src/debug/**' },
        { type: 'polyfills', pattern: 'src/polyfills/**' },
        { type: 'config', pattern: 'src/config.ts', mode: 'file' },
      ],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        rules: [
          { from: { type: 'domain' }, allow: to('domain', 'generated') },
          { from: { type: 'generated' }, allow: to('generated', 'data') },
          { from: { type: 'data' }, allow: to('data', 'domain', 'generated', 'debug', 'feedback', 'config') },
          { from: { type: 'sync' }, allow: to('sync', 'data', 'domain', 'generated', 'debug', 'feedback', 'config') },
          { from: { type: 'state' }, allow: to('state', 'sync', 'data', 'domain', 'generated', 'debug', 'feedback', 'config') },
          { from: { type: 'ui' }, allow: to('ui', 'state', 'sync', 'data', 'domain', 'generated', 'debug', 'feedback', 'config') },
          { from: { type: 'feedback' }, allow: to('feedback') },
          { from: { type: 'debug' }, allow: to('debug') },
          { from: { type: 'polyfills' }, allow: to('polyfills') },
          { from: { type: 'config' }, allow: [] },
        ],
      }],
      // Hook correctness (RN standard). exhaustive-deps stays a warning — the screens carry a few
      // intentional `// eslint-disable-next-line` opt-outs that need the rule to be defined.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
