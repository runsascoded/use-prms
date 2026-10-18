import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'site/e2e/**',
      // `.github/scripts/*.test.cjs` are node:test suites (run via `node
      // --test` in the preview workflow), not vitest.
      '.github/**',
    ],
  },
})
