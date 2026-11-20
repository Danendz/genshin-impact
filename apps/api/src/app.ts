import type { Db } from '@gi/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import type { Env } from './env'
import type { MediaStore } from './media/store'
import { adminRoute } from './routes/admin'
import { charactersRoute } from './routes/characters'
import { materialsRoute } from './routes/materials'
import { weaponsRoute } from './routes/weapons'
import type { SyncController } from './sync/controller-types'

export type AppDeps = {
  db: Db
  env: Env
  sync: SyncController
  store: MediaStore
}

export function createApp(deps: AppDeps) {
  const { db, store } = deps
  return new Hono()
    .use(cors({ origin: deps.env.CORS_ORIGIN }))
    .get('/health', (c) => c.json({ ok: true }))
    .use('/v1/*', etag())
    .use('/v1/*', async (c, next) => {
      await next()
      if (c.res.status === 200)
        c.header('Cache-Control', 'public, max-age=300, s-maxage=3600')
    })
    .route('/v1/characters', charactersRoute({ db, store }))
    .route('/v1/weapons', weaponsRoute({ db, store }))
    .route('/v1/materials', materialsRoute({ db, store }))
    .route(
      '/admin',
      adminRoute({ adminToken: deps.env.ADMIN_TOKEN, sync: deps.sync }),
    )
}

export type AppType = ReturnType<typeof createApp>
