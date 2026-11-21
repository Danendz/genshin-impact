import { createDb } from '@gi/db'
import { parseCliEnv } from '../env'
import { createS3Store } from '../media/s3-store'
import { createAmberSource } from './amber/amber-source'
import { runSync } from './run-sync'

async function main(): Promise<number> {
  const full = process.argv.includes('--full')
  const details = process.argv.includes('--details')
  const env = parseCliEnv(process.env)
  const { db, sql, close } = createDb(env.DATABASE_URL)
  const started = Date.now()
  try {
    const result = await runSync(
      {
        db,
        sql,
        source: createAmberSource(),
        store: createS3Store(env),
        fetch,
        log: (m) => console.log(`[sync] ${m}`),
      },
      { full, details },
    )
    if (result === 'busy') {
      console.error('another sync is already running')
      return 1
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    console.log(`sync run ${result.runId}: ${result.status} in ${secs}s`)
    console.table(result.counts)
    for (const f of result.failures)
      console.log(`  failed ${f.entity} ${f.id}: ${f.reason}`)
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
