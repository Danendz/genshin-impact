import { characterModels, type Db, mediaAssets } from '@gi/db'
import { eq } from 'drizzle-orm'
import type { MediaStore } from '../media/store'

const PREFIXES = ['skowt_character/', 'model/']

/**
 * Objects under the skowt prefixes that no row references any more (old
 * builds, replaced images). Keys are content-addressed, so the sync never
 * deletes; this is the manual clean-up.
 */
export async function findOrphans(
  db: Db,
  store: MediaStore,
): Promise<string[]> {
  const referenced = new Set<string>()
  const prefixes: string[] = []
  for (const r of await db
    .select({ key: mediaAssets.r2Key })
    .from(mediaAssets)
    .where(eq(mediaAssets.ownerType, 'skowt_character'))) {
    referenced.add(r.key)
  }
  for (const m of await db.select().from(characterModels)) {
    for (const k of [m.glbKey, m.weaponKey, m.propsKey])
      if (k) referenced.add(k)
    if (m.toonPrefix) prefixes.push(m.toonPrefix)
  }
  const orphans: string[] = []
  for (const prefix of PREFIXES) {
    for (const key of await store.list(prefix)) {
      if (!referenced.has(key) && !prefixes.some((p) => key.startsWith(p)))
        orphans.push(key)
    }
  }
  return orphans
}
