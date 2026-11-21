import type { AppType } from '@gi/api/app'
import { hc } from 'hono/client'

const url = import.meta.env.VITE_API_URL
if (!url) {
  throw new Error(
    'VITE_API_URL is not set. Add it to the repo-root .env (see .env.example).',
  )
}

export const api = hc<AppType>(url)
