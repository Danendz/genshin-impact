import { characterI18n, characters, type Db } from '@gi/db'
import { ELEMENTS, WEAPON_TYPES } from '@gi/shared'
import { aliasedTable, and, asc, desc, eq, type SQL, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { MediaStore } from '../media/store'
import { localeParam } from './locale'
import { loadMedia } from './media'
import { validate } from './validate'

const listQuery = z.object({
  locale: localeParam,
  element: z.enum(ELEMENTS).optional(),
  weaponType: z.enum(WEAPON_TYPES).optional(),
  rarity: z.coerce.number().int().min(1).max(5).optional(),
})
const detailQuery = z.object({ locale: localeParam })

export function charactersRoute(deps: { db: Db; store: MediaStore }) {
  const { db, store } = deps
  const req = aliasedTable(characterI18n, 'req')
  const fb = aliasedTable(characterI18n, 'fb')
  const joins = (locale: string) =>
    [
      sql`${req.characterId} = ${characters.id} and ${req.locale} = ${locale}`,
      sql`${fb.characterId} = ${characters.id} and ${fb.locale} = 'en'`,
    ] as const

  const base = (locale: string) => {
    const [a, b] = joins(locale)
    return db
      .select({
        c: characters,
        locale: sql<string>`case when ${req.characterId} is not null then ${req.locale}::text else ${fb.locale}::text end`,
        name: sql<string>`coalesce(${req.name}, ${fb.name})`,
        title: sql<
          string | null
        >`case when ${req.characterId} is not null then ${req.title} else ${fb.title} end`,
        description: sql<
          string | null
        >`case when ${req.characterId} is not null then ${req.description} else ${fb.description} end`,
        details: sql<unknown>`coalesce(${req.details}, ${fb.details})`,
      })
      .from(characters)
      .leftJoin(req, a)
      .leftJoin(fb, b)
  }

  return new Hono()
    .get('/', validate('query', listQuery), async (c) => {
      const q = c.req.valid('query')
      const conds: SQL[] = [sql`coalesce(${req.name}, ${fb.name}) is not null`]
      if (q.element) conds.push(eq(characters.element, q.element))
      if (q.weaponType) conds.push(eq(characters.weaponType, q.weaponType))
      if (q.rarity) conds.push(eq(characters.rarity, q.rarity))
      const rows = await base(q.locale)
        .where(and(...conds))
        .orderBy(
          desc(characters.rarity),
          sql`coalesce(${req.name}, ${fb.name})`,
          asc(characters.id),
        )
      const media = await loadMedia(
        db,
        store,
        'character',
        rows.map((r) => r.c.id),
      )
      return c.json({
        items: rows.map((r) => ({
          id: r.c.id,
          name: r.name,
          rarity: r.c.rarity,
          element: r.c.element,
          weaponType: r.c.weaponType,
          media: media.get(r.c.id) ?? {},
        })),
      })
    })
    .get('/:id', validate('query', detailQuery), async (c) => {
      const { locale } = c.req.valid('query')
      const [r] = await base(locale)
        .where(eq(characters.id, c.req.param('id')))
        .limit(1)
      if (!r || r.name == null) return c.json({ error: 'not_found' }, 404)
      const media = await loadMedia(db, store, 'character', [r.c.id])
      const ch = r.c
      return c.json({
        id: ch.id,
        rarity: ch.rarity,
        element: ch.element,
        weaponType: ch.weaponType,
        region: ch.region,
        birthday:
          ch.birthdayMonth != null && ch.birthdayDay != null
            ? [ch.birthdayMonth, ch.birthdayDay]
            : null,
        releaseAt: ch.releaseAt?.toISOString() ?? null,
        locale: r.locale,
        name: r.name,
        title: r.title,
        description: r.description,
        details: r.details,
        media: media.get(ch.id) ?? {},
      })
    })
}
