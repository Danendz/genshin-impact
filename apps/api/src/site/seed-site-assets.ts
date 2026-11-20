import { type Db, siteAssets } from '@gi/db'
import { eq } from 'drizzle-orm'
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
): Promise<{ uploaded: number; skipped: number }> {
  const { db, store } = deps
  const orders = sortOrders(files)
  let uploaded = 0
  let skipped = 0
  for (const file of files) {
    const img = await processImage(file.bytes)
    const [existing] = await db
      .select({ id: siteAssets.id })
      .from(siteAssets)
      .where(eq(siteAssets.contentHash, img.contentHash))
    if (existing) {
      skipped++
      continue
    }
    const key = `site/${group}/${img.contentHash.slice(0, 12)}.webp`
    await store.put(key, img.body, 'image/webp')
    await db.insert(siteAssets).values({
      group,
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
