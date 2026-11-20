import { type Db, weaponI18n, weapons } from '@gi/db'
import { WEAPON_TYPES } from '@gi/shared'
import { aliasedTable, and, desc, eq, type SQL, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { MediaStore } from '../media/store'
import { localeParam } from './locale'
import { loadMedia } from './media'
import { validate } from './validate'

const listQuery = z.object({
  locale: localeParam,
  weaponType: z.enum(WEAPON_TYPES).optional(),
  rarity: z.coerce.number().int().min(1).max(5).optional(),
})
const detailQuery = z.object({ locale: localeParam })

export function weaponsRoute(deps: { db: Db; store: MediaStore }) {
  const { db, store } = deps
  const req = aliasedTable(weaponI18n, 'req')
  const fb = aliasedTable(weaponI18n, 'fb')

  const base = (locale: string) =>
    db
      .select({
        w: weapons,
        locale: sql<string>`case when ${req.weaponId} is not null then ${req.locale}::text else ${fb.locale}::text end`,
        name: sql<string>`coalesce(${req.name}, ${fb.name})`,
        description: sql<
          string | null
        >`case when ${req.weaponId} is not null then ${req.description} else ${fb.description} end`,
        details: sql<unknown>`coalesce(${req.details}, ${fb.details})`,
      })
      .from(weapons)
      .leftJoin(
        req,
        sql`${req.weaponId} = ${weapons.id} and ${req.locale} = ${locale}`,
      )
      .leftJoin(fb, sql`${fb.weaponId} = ${weapons.id} and ${fb.locale} = 'en'`)

  return new Hono()
    .get('/', validate('query', listQuery), async (c) => {
      const q = c.req.valid('query')
      const conds: SQL[] = [sql`coalesce(${req.name}, ${fb.name}) is not null`]
      if (q.weaponType) conds.push(eq(weapons.weaponType, q.weaponType))
      if (q.rarity) conds.push(eq(weapons.rarity, q.rarity))
      const rows = await base(q.locale)
        .where(and(...conds))
        .orderBy(desc(weapons.rarity), sql`coalesce(${req.name}, ${fb.name})`)
      const media = await loadMedia(
        db,
        store,
        'weapon',
        rows.map((r) => r.w.id),
      )
      return c.json({
        items: rows.map((r) => ({
          id: r.w.id,
          name: r.name,
          rarity: r.w.rarity,
          weaponType: r.w.weaponType,
          media: media.get(r.w.id) ?? {},
        })),
      })
    })
    .get('/:id', validate('query', detailQuery), async (c) => {
      const { locale } = c.req.valid('query')
      const [r] = await base(locale)
        .where(eq(weapons.id, c.req.param('id')))
        .limit(1)
      if (!r || r.name == null) return c.json({ error: 'not_found' }, 404)
      const media = await loadMedia(db, store, 'weapon', [r.w.id])
      return c.json({
        id: r.w.id,
        rarity: r.w.rarity,
        weaponType: r.w.weaponType,
        locale: r.locale,
        name: r.name,
        description: r.description,
        details: r.details,
        media: media.get(r.w.id) ?? {},
      })
    })
}
