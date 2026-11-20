import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDb } from '@gi/db'
import { parseCliEnv } from '../env'
import { createS3Store } from '../media/s3-store'
import { filterImageFiles } from './seed-files'
import { seedSiteAssets } from './seed-site-assets'

async function main(): Promise<number> {
  const [group, dir] = process.argv.slice(2)
  if (!group || !dir) {
    console.error('usage: seed:site <group> <dir>')
    return 1
  }
  const env = parseCliEnv(process.env)
  const entries = await readdir(dir, { withFileTypes: true })
  const all = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => ({
        name: e.name,
        bytes: new Uint8Array(await readFile(join(dir, e.name))),
      })),
  )
  const files = await filterImageFiles(all, (m) => console.log(`[seed] ${m}`))
  const { db, close } = createDb(env.DATABASE_URL)
  try {
    const { uploaded, skipped } = await seedSiteAssets(
      { db, store: createS3Store(env) },
      group,
      files,
    )
    console.log(`uploaded ${uploaded}, skipped ${skipped}`)
    return 0
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
