import { type Db, mediaAssets } from '@gi/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { MediaStore } from '../media/store'

export type MediaKind = (typeof mediaAssets.$inferSelect)['kind']
export type MediaMap = Partial<Record<MediaKind, string>>

export async function loadMedia(
  db: Db,
  store: MediaStore,
  ownerType: 'character' | 'weapon' | 'material',
  ids: string[],
): Promise<Map<string, MediaMap>> {
  const out = new Map<string, MediaMap>()
  if (ids.length === 0) return out
  const rows = await db
    .select({
      ownerId: mediaAssets.ownerId,
      kind: mediaAssets.kind,
      r2Key: mediaAssets.r2Key,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.ownerType, ownerType),
        inArray(mediaAssets.ownerId, ids),
      ),
    )
  for (const r of rows) {
    const m = out.get(r.ownerId) ?? {}
    m[r.kind] = store.publicUrl(r.r2Key)
    out.set(r.ownerId, m)
  }
  return out
}
