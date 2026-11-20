import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'models',
    testTimeout: 60000,
  },
})
