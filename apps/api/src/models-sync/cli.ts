// Models source 3D models + images -> R2 + Postgres.
//
//   models:sync                          every character, only what changed
//   models:sync --only citlali,hu-tao    some characters
//   models:sync --cache ../models/characters   reuse files fetch_characters.py saved
//   models:sync --force | --dry-run | --no-models | --no-media
//   models:sync --gc [--yes]             list (and with --yes delete) orphaned objects
import { createDb } from '@gi/db'
import { parseCliEnv } from '../env'
import { createS3Store } from '../media/s3-store'
import { findOrphans } from './gc'
import { createLocalCache } from './local-cache'
import { runModelsSync } from './run-models-sync'
import { createSourceClient } from './source-client'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name: string) => process.argv.includes(name)

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

async function main(): Promise<number> {
  const env = parseCliEnv(process.env)
  const { db, sql, close } = createDb(env.DATABASE_URL)
  const store = createS3Store(env)
  const log = (m: string) => console.log(`[models] ${m}`)
  try {
    if (has('--gc')) {
      const orphans = await findOrphans(db, store)
      for (const k of orphans) console.log(k)
      console.log(`${orphans.length} orphaned object(s)`)
      if (has('--yes')) {
        for (const k of orphans) await store.delete(k)
        console.log('deleted')
      }
      return 0
    }
    const cacheDir = flag('--cache')
    const started = Date.now()
    const result = await runModelsSync(
      {
        db,
        sql,
        store,
        client: createSourceClient({
          baseUrl: requireEnv('MODELS_SOURCE_URL'),
          cookie: process.env.MODELS_COOKIE || undefined,
        }),
        cache: cacheDir ? createLocalCache(cacheDir) : undefined,
        log,
      },
      {
        only: flag('--only')
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        force: has('--force'),
        dryRun: has('--dry-run'),
        skipModels: has('--no-models'),
        skipMedia: has('--no-media'),
      },
    )
    if (result === 'busy') {
      console.error('another models sync is already running')
      return 1
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    console.log(
      `models sync run ${result.runId ?? '(dry run)'}: ${result.status} in ${secs}s`,
    )
    console.table(result.counts)
    for (const f of result.failures)
      console.log(`  failed ${f.id}: ${f.reason}`)
    if (result.authFailed)
      console.log(
        '  MODELS_COOKIE was rejected: previews were saved; refresh the cookie',
      )
    return result.status === 'failed' ? 1 : 0
  } finally {
    await close()
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
