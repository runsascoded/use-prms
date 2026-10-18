import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * The one rule this config exists to enforce: the framework-free core
 * (`use-prms/core` — every file under `src/` except the framework adapters
 * listed below) must never import a UI framework (React or Vue). That
 * boundary is what lets a Cloudflare Worker — or either binding — use the
 * codecs + store without pulling in a framework. New files under `src/` are
 * guarded automatically; only the explicit adapter all-lists are exempt.
 */

const BANNED = {
  patterns: [{
    group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'vue', 'vue/*'],
    message: 'use-prms/core must stay framework-free — keep React imports in the React adapters (useUrlState.ts, useUrlAlias.ts, reflection.ts, sections/spy.tsx) and Vue imports in vue.ts.',
  }],
}

// Files allowed to import a UI framework: the bindings, and any test file
// (tests are not shipped and may render with a framework's test utils).
const ADAPTERS = [
  'src/useUrlState.ts',
  'src/useUrlAlias.ts',
  'src/reflection.ts',
  'src/sections/spy.tsx',
  'src/vue.ts',
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
    files: ADAPTERS,
    rules: { 'no-restricted-imports': 'off' },
  },
)
