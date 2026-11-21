import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createDb } from '@gi/db'
import { parseCliEnv } from '../env'
import { createS3Store } from '../media/s3-store'
import { filterImageFiles } from './seed-files'
import { seedSiteAssets } from './seed-site-assets'

async function main(): Promise<number> {
  const raw = process.argv.includes('--raw')
  const [group, dir] = process.argv.slice(2).filter((a) => a !== '--raw')
  if (!group || !dir) {
    console.error('usage: seed:site <group> <dir> [--raw]')
    return 1
  }
  const env = parseCliEnv(process.env)
  // sub-folders count too: `gi/sky.webp` is named `gi/sky.webp`
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  const all = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const path = join(e.parentPath, e.name)
        return {
          name: relative(dir, path),
          bytes: new Uint8Array(await readFile(path)),
        }
      }),
  )
  const files = await filterImageFiles(all, (m) => console.log(`[seed] ${m}`))
  const { db, close } = createDb(env.DATABASE_URL)
  try {
    const { uploaded, skipped } = await seedSiteAssets(
      { db, store: createS3Store(env) },
      group,
      files,
      { raw },
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
