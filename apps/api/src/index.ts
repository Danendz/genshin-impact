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

const sync = createSyncController({
  db,
  sql,
  source: createAmberSource(),
  store,
  fetch,
  log: (m) => console.log(`[sync] ${m}`),
})
const app = createApp({ db, env, store, sync })

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${info.port}`)
})

const SHUTDOWN_WAIT_MS = 25_000
let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  server.close()
  // let an in-flight sync finish, bounded; stale rows are recovered next run
  await Promise.race([
    sync.idle?.(),
    new Promise((r) => setTimeout(r, SHUTDOWN_WAIT_MS).unref()),
  ])
  await close().catch(() => {})
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
