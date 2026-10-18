import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [react(), vue()],
  server: {
    port: 50373,
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'vue'],
  },
  // `use-prms` is linked (`link:..`) and rebuilt by `tsup --watch` (run via the
  // `dev` script). Excluding it from pre-bundling makes Vite serve its `dist`
  // directly and watch it, so a library rebuild live-reloads the demo. Its
  // entry points stay separate bundles, preserving their per-entry default
  // strategy (query vs. hash).
  optimizeDeps: {
    exclude: ['use-prms', 'use-prms/core', 'use-prms/hash', 'use-prms/sections', 'use-prms/vue'],
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // The React SPA (index.html) and the standalone Vue parity page.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        vue: fileURLToPath(new URL('./vue.html', import.meta.url)),
      },
    },
  },
})
