import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', core: 'src/core.ts', vue: 'src/vue.ts', hash: 'src/hash.ts', sections: 'src/sections/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'vue'],
})
