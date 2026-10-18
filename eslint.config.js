import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * The one rule this config exists to enforce: the framework-free core
 * (`use-prms/core` — every file under `src/` except the React adapters
 * listed below) must never import React. That boundary is what lets a
 * Cloudflare Worker, or the Vue binding, use the codecs + store without
 * pulling in React. New files under `src/` are guarded automatically; only
 * the explicit adapter all-list is exempt.
 */

const BANNED = {
  patterns: [{
    group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
    message: 'use-prms/core must stay framework-free — keep React imports in the React adapter files (useUrlState.ts, useUrlAlias.ts, reflection.ts, sections/spy.tsx).',
  }],
}

// Files allowed to import React: the React bindings, and any test file
// (tests are not shipped and may render with React Testing Library).
const REACT_ADAPTERS = [
  'src/useUrlState.ts',
  'src/useUrlAlias.ts',
  'src/reflection.ts',
  'src/sections/spy.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'site/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-restricted-imports': ['error', BANNED],
      // Registered so the intentional `eslint-disable react-hooks/*`
      // directives in the adapter files resolve. Rules-of-hooks is a real
      // guard; exhaustive-deps stays a (non-failing) warning.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: REACT_ADAPTERS,
    rules: { 'no-restricted-imports': 'off' },
  },
)
