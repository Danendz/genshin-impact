import { type Db, siteAssets } from '@gi/db'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { MediaStore } from '../media/store'

export function siteRoute(deps: { db: Db; store: MediaStore }) {
  const { db, store } = deps
  return (
    new Hono()
      .get('/home-backgrounds', async (c) => {
        const rows = await db
          .select()
          .from(siteAssets)
          .where(eq(siteAssets.group, 'home-background'))
          .orderBy(asc(siteAssets.sortOrder), asc(siteAssets.id))
        c.header('Cache-Control', 'public, max-age=3600')
        return c.json({
          items: rows.map((r) => ({
            url: store.publicUrl(r.r2Key),
            width: r.width,
            height: r.height,
          })),
        })
      })
      /** viewer backdrop textures by file name (`gi/sky.webp`, `shared/palette.webp`) */
      .get('/backdrops', async (c) => {
        const rows = await db
          .select({ name: siteAssets.name, r2Key: siteAssets.r2Key })
          .from(siteAssets)
          .where(eq(siteAssets.group, 'backdrop'))
        c.header('Cache-Control', 'public, max-age=3600')
        const items: Record<string, string> = {}
        for (const r of rows)
          if (r.name) items[r.name] = store.publicUrl(r.r2Key)
        return c.json({ items })
      })
  )
}
