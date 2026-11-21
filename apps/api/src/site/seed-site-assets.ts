import { createHash } from 'node:crypto'
import { type Db, siteAssets } from '@gi/db'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { processImage } from '../media/process-image'
import type { MediaStore } from '../media/store'

export type SiteFile = { name: string; bytes: Uint8Array }

const isNumeric = (name: string) => /^\d+$/.test(name)

/** Numeric file names sort numerically; otherwise alphabetical position. */
function sortOrders(files: SiteFile[]): Map<string, number> {
  const orders = new Map<string, number>()
  if (files.every((f) => isNumeric(f.name))) {
    for (const f of files) orders.set(f.name, Number(f.name))
  } else {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
    sorted.forEach((f, i) => {
      orders.set(f.name, i)
    })
  }
  return orders
}

export async function seedSiteAssets(
  deps: { db: Db; store: MediaStore },
  group: string,
  files: SiteFile[],
  opts: { raw?: boolean } = {},
): Promise<{ uploaded: number; skipped: number }> {
  const { db, store } = deps
  const orders = sortOrders(files)
  let uploaded = 0
  let skipped = 0
  for (const file of files) {
    // raw: stored byte for byte (data textures such as the backdrop palette)
    const img = opts.raw
      ? await rawImage(file.bytes)
      : { ...(await processImage(file.bytes)), ext: 'webp' }
    const [existing] = await db
      .select({ id: siteAssets.id })
      .from(siteAssets)
      .where(eq(siteAssets.contentHash, img.contentHash))
    if (existing) {
      skipped++
      continue
    }
    const key = `site/${group}/${img.contentHash.slice(0, 12)}.${img.ext}`
    await store.put(key, img.body, `image/${img.ext}`)
    await db.insert(siteAssets).values({
      group,
      name: file.name,
      r2Key: key,
      width: img.width,
      height: img.height,
      contentHash: img.contentHash,
      sortOrder: orders.get(file.name) ?? 0,
    })
    uploaded++
  }
  return { uploaded, skipped }
}

async function rawImage(bytes: Uint8Array) {
  const meta = await sharp(bytes).metadata()
  return {
    body: bytes,
    ext: meta.format === 'jpeg' ? 'jpg' : (meta.format as string),
    width: meta.width as number,
    height: meta.height as number,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  }
}
