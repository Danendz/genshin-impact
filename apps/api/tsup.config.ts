import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/sync/cli.ts',
    'seed-site': 'src/site/seed-cli.ts',
  },
  format: ['esm'],
  target: 'node24',
  clean: true,
  // Workspace packages export raw .ts, so bundle them; npm deps stay external.
  noExternal: [/^@gi\//],
})
