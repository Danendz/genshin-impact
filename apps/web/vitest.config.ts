import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { VITE_API_URL: 'http://localhost:8787' },
  },
})
