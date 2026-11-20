import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  // Workspace packages export raw .ts, so bundle them; npm deps stay external.
  noExternal: [/^@gi\//],
})
