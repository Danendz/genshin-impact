import type { Db } from '@gi/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import type { SyncController } from './sync/controller-types'

export type AppDeps = { db: Db; env: Env; sync: SyncController }

export function createApp(deps: AppDeps) {
  return new Hono()
    .use(cors({ origin: deps.env.CORS_ORIGIN }))
    .get('/health', (c) => c.json({ ok: true }))
}

export type AppType = ReturnType<typeof createApp>
