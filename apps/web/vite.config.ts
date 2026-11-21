import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const envDir = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, envDir, 'VITE_')
    if (!env.VITE_API_URL && !process.env.VITE_API_URL)
      throw new Error('VITE_API_URL must be set for a production build')
  }
  return {
    // VITE_* vars live in the repo-root .env (shared with the API)
    envDir,
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routeFileIgnorePattern: '\\.test\\.',
      }),
      react(),
      tailwindcss(),
    ],
  }
})
