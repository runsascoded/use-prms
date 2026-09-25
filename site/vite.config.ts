import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 50373,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // `use-prms` is linked (`link:..`) and rebuilt by `tsup --watch` (run via the
  // `dev` script). Excluding it from pre-bundling makes Vite serve its `dist`
  // directly and watch it, so a library rebuild live-reloads the demo. Its two
  // entry points stay separate bundles, preserving their per-entry default
  // strategy (query vs. hash).
  optimizeDeps: {
    exclude: ['use-prms', 'use-prms/hash'],
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
})
