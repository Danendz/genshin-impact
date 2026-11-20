import { type Db, materialI18n, materials } from '@gi/db'
import { aliasedTable, and, desc, eq, type SQL, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { MediaStore } from '../media/store'
import { localeParam } from './locale'
import { loadMedia } from './media'
import { validate } from './validate'

const listQuery = z.object({
  locale: localeParam,
  category: z.string().min(1).optional(),
})

export function materialsRoute(deps: { db: Db; store: MediaStore }) {
  const { db, store } = deps
  const req = aliasedTable(materialI18n, 'req')
  const fb = aliasedTable(materialI18n, 'fb')

  return new Hono().get('/', validate('query', listQuery), async (c) => {
    const q = c.req.valid('query')
    const conds: SQL[] = [sql`coalesce(${req.name}, ${fb.name}) is not null`]
    if (q.category) conds.push(eq(materials.category, q.category))
    const rows = await db
      .select({
        m: materials,
        locale: sql<string>`case when ${req.materialId} is not null then ${req.locale}::text else ${fb.locale}::text end`,
        name: sql<string>`coalesce(${req.name}, ${fb.name})`,
        description: sql<
          string | null
        >`case when ${req.materialId} is not null then ${req.description} else ${fb.description} end`,
      })
      .from(materials)
      .leftJoin(
        req,
        sql`${req.materialId} = ${materials.id} and ${req.locale} = ${q.locale}`,
      )
      .leftJoin(
        fb,
        sql`${fb.materialId} = ${materials.id} and ${fb.locale} = 'en'`,
      )
      .where(and(...conds))
      .orderBy(desc(materials.rarity), sql`coalesce(${req.name}, ${fb.name})`)
    const media = await loadMedia(
      db,
      store,
      'material',
      rows.map((r) => r.m.id),
    )
    return c.json({
      items: rows.map((r) => ({
        id: r.m.id,
        name: r.name,
        description: r.description,
        rarity: r.m.rarity,
        category: r.m.category,
        media: media.get(r.m.id) ?? {},
      })),
    })
  })
}
