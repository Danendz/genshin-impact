import { createDb } from '@gi/db'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { parseEnv } from './env'

const env = parseEnv(process.env)
const { db, close } = createDb(env.DATABASE_URL)

const app = createApp({
  db,
  env,
  // Stub until Task 8 implements the real SyncController.
  sync: { trigger: async () => 'busy' },
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
