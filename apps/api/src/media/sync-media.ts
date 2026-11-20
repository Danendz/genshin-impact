import { type Db, mediaAssets } from '@gi/db'
import { and, eq } from 'drizzle-orm'
import type { MediaRef } from '../sync/source'
import { mediaKey, processImage } from './process-image'
import type { MediaStore } from './store'

export type MediaOwner = {
  type: 'character' | 'weapon' | 'material'
  id: string
}

export async function syncMedia(
  deps: { db: Db; store: MediaStore; fetch: typeof fetch },
  owner: MediaOwner,
  refs: MediaRef[],
  opts: { force: boolean },
): Promise<{ uploaded: number; skipped: number; missing: number }> {
  const { db, store, fetch: fetchFn } = deps
  const result = { uploaded: 0, skipped: 0, missing: 0 }

  for (const ref of refs) {
    const where = and(
      eq(mediaAssets.ownerType, owner.type),
      eq(mediaAssets.ownerId, owner.id),
      eq(mediaAssets.kind, ref.kind),
    )
    if (!opts.force) {
      const [row] = await db
        .select({ sourceUrl: mediaAssets.sourceUrl })
        .from(mediaAssets)
        .where(where)
      if (row?.sourceUrl === ref.url) {
        result.skipped++
        continue
      }
    }

    const res = await fetchFn(ref.url)
    if (res.status === 404) {
      result.missing++
      continue
    }
    if (!res.ok) throw new Error(`fetch ${ref.url} failed: ${res.status}`)

    const img = await processImage(new Uint8Array(await res.arrayBuffer()))
    const key = mediaKey(owner.type, owner.id, ref.kind, img.contentHash)
    if (opts.force || !(await store.exists(key))) {
      await store.put(key, img.body, 'image/webp')
    }
    const values = {
      ownerType: owner.type,
      ownerId: owner.id,
      kind: ref.kind,
      sourceUrl: ref.url,
      r2Key: key,
      width: img.width,
      height: img.height,
      contentHash: img.contentHash,
    }
    await db
      .insert(mediaAssets)
      .values(values)
      .onConflictDoUpdate({
        target: [mediaAssets.ownerType, mediaAssets.ownerId, mediaAssets.kind],
        set: values,
      })
    result.uploaded++
  }
  return result
}
