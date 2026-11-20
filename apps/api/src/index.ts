import { createDb } from '@gi/db'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { parseEnv } from './env'
import { createS3Store } from './media/s3-store'
import { createAmberSource } from './sync/amber/amber-source'
import { createSyncController } from './sync/controller'

const env = parseEnv(process.env)
const { db, sql, close } = createDb(env.DATABASE_URL)
const store = createS3Store(env)

const app = createApp({
  db,
  env,
  store,
  sync: createSyncController({
    db,
    sql,
    source: createAmberSource(),
    store,
    fetch,
    log: (m) => console.log(`[sync] ${m}`),
  }),
})

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${info.port}`)
})

const shutdown = () => {
  server.close()
  void close().finally(() => process.exit(0))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
