import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'db',
    fileParallelism: false,
    globalSetup: ['./vitest.global-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
})
