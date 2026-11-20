import {
  characterI18n,
  characters,
  createDb,
  materialI18n,
  materials,
  mediaAssets,
  weaponI18n,
  weapons,
} from '@gi/db'
import { resetDb } from '@gi/db/test-utils'
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createApp } from '../app'
import { parseEnv } from '../env'
import { createMemoryStore } from '../media/memory-store'
import type { SyncController } from '../sync/controller-types'

const { db, close } = createDb(inject('dbUrl'))
const env = parseEnv({
  DATABASE_URL: 'postgres://x',
  R2_ENDPOINT: 'http://r2',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET: 'b',
  MEDIA_PUBLIC_URL: 'http://media.test/gi-media/',
  ADMIN_TOKEN: 'secret-secret-secret-secret-secret-00',
  CORS_ORIGIN: 'http://localhost:5173',
  PORT: '8787',
})
const store = createMemoryStore(env.MEDIA_PUBLIC_URL)

let triggerResult: Awaited<ReturnType<SyncController['trigger']>> | Error
let triggerOpts: unknown
const sync: SyncController = {
  async trigger(opts) {
    triggerOpts = opts
    if (triggerResult instanceof Error) throw triggerResult
    return triggerResult
  },
}
const app = createApp({ db, env, sync, store })

async function seedChar(
  id: string,
  element: 'pyro' | 'dendro',
  rarity: number,
  names: Partial<Record<'en' | 'ru' | 'zh-CN', string>>,
) {
  await db.insert(characters).values({
    id,
    rarity,
    element,
    weaponType: 'sword',
    sourceHash: 'h',
  })
  for (const [locale, name] of Object.entries(names))
    await db.insert(characterI18n).values({
      characterId: id,
      locale: locale as 'en',
      name,
      details: { x: 1 },
    })
}

beforeEach(async () => {
  await resetDb(db)
  triggerResult = { runId: 1 }
  await seedChar('10000005-pyro', 'pyro', 5, { en: 'Diluc', ru: 'Дилюк' })
  await seedChar('10000002-dendro', 'dendro', 4, {
    en: 'Collei',
    'zh-CN': '柯莱',
  })
  await seedChar('10000003-dendro', 'dendro', 5, {
    en: 'Nahida',
    'zh-CN': '纳西妲',
  })
  await db.insert(mediaAssets).values({
    ownerType: 'character',
    ownerId: '10000005-pyro',
    kind: 'icon',
    sourceUrl: 's',
    r2Key: 'character/10000005-pyro/icon.webp',
    width: 1,
    height: 1,
    contentHash: 'c',
  })
})
afterAll(() => close())

describe('characters', () => {
  it('serves detail', async () => {
    const res = await app.request('/v1/characters/10000005-pyro?locale=en')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { details: unknown }
    expect(body).toMatchObject({
      element: 'pyro',
      locale: 'en',
      name: 'Diluc',
    })
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=300, s-maxage=3600',
    )
    expect(body.details).toEqual({ x: 1 })
  })

  it('falls back to en per entity', async () => {
    const res = await app.request('/v1/characters/10000002-dendro?locale=ru')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ locale: 'en', name: 'Collei' })
  })

  it('lists filtered with localized names, rarity desc', async () => {
    const res = await app.request('/v1/characters?locale=zh-CN&element=dendro')
    const { items } = (await res.json()) as { items: { name: string }[] }
    expect(items.map((i) => i.name)).toEqual(['纳西妲', '柯莱'])
  })

  it('list mixes requested and fallback names', async () => {
    const res = await app.request('/v1/characters?locale=ru')
    const { items } = (await res.json()) as { items: { name: string }[] }
    expect(items.map((i) => i.name).sort()).toEqual(
      ['Collei', 'Nahida', 'Дилюк'].sort(),
    )
  })

  it('rejects bad input and unknown ids', async () => {
    expect((await app.request('/v1/characters?locale=jp')).status).toBe(400)
    expect((await app.request('/v1/characters?rarity=9')).status).toBe(400)
    const nf = await app.request('/v1/characters/nope')
    expect(nf.status).toBe(404)
    expect(await nf.json()).toEqual({ error: 'not_found' })
  })

  it('supports conditional requests', async () => {
    const first = await app.request('/v1/characters?locale=en')
    const tag = first.headers.get('etag')
    expect(tag).toBeTruthy()
    const second = await app.request('/v1/characters?locale=en', {
      headers: { 'If-None-Match': tag as string },
    })
    expect(second.status).toBe(304)
  })

  it('emits absolute media urls under MEDIA_PUBLIC_URL', async () => {
    const list = (await (await app.request('/v1/characters')).json()) as {
      items: { id: string; media: Record<string, string> }[]
    }
    const d = list.items.find((i) => i.id === '10000005-pyro')
    expect(d?.media.icon).toBe(
      'http://media.test/gi-media/character/10000005-pyro/icon.webp',
    )
    const detail = (await (
      await app.request('/v1/characters/10000005-pyro')
    ).json()) as { media: Record<string, string> }
    expect(detail.media.icon?.startsWith('http://media.test/gi-media/')).toBe(
      true,
    )
  })
})

describe('weapons', () => {
  it('lists, details and falls back', async () => {
    await db
      .insert(weapons)
      .values({ id: 'w1', rarity: 5, weaponType: 'sword', sourceHash: 'h' })
    await db.insert(weaponI18n).values({
      weaponId: 'w1',
      locale: 'en',
      name: 'Blade',
      details: { y: [2] },
    })
    const list = (await (
      await app.request('/v1/weapons?locale=ru&weaponType=sword')
    ).json()) as { items: { name: string }[] }
    expect(list.items[0]?.name).toBe('Blade')
    const d = await app.request('/v1/weapons/w1?locale=ru')
    expect(await d.json()).toMatchObject({
      locale: 'en',
      name: 'Blade',
      details: { y: [2] },
    })
    expect((await app.request('/v1/weapons/zzz')).status).toBe(404)
  })
})

describe('caching headers', () => {
  const CC = 'public, max-age=300, s-maxage=3600'
  it('weapons and materials lists carry Cache-Control and ETag', async () => {
    for (const path of ['/v1/weapons', '/v1/materials']) {
      const res = await app.request(path)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe(CC)
      expect(res.headers.get('etag')).toBeTruthy()
    }
  })
  it('no Cache-Control on errors or admin', async () => {
    for (const path of ['/v1/characters?locale=jp', '/v1/characters/nope'])
      expect((await app.request(path)).headers.get('cache-control')).toBeNull()
    const res = await app.request('/admin/sync', { method: 'POST' })
    expect(res.headers.get('cache-control')).toBeNull()
  })
})

describe('materials', () => {
  beforeEach(async () => {
    await db.insert(materials).values([
      { id: 'm1', rarity: 3, category: 'ore', sourceHash: 'h' },
      { id: 'm2', rarity: 2, category: 'food', sourceHash: 'h' },
    ])
    await db.insert(materialI18n).values([
      { materialId: 'm1', locale: 'en', name: 'Iron' },
      { materialId: 'm1', locale: 'ru', name: 'Железо' },
      { materialId: 'm2', locale: 'en', name: 'Bread' },
    ])
  })
  it('falls back per entity and filters by category', async () => {
    const all = (await (
      await app.request('/v1/materials?locale=ru')
    ).json()) as {
      items: { name: string }[]
    }
    expect(all.items.map((i) => i.name)).toEqual(['Железо', 'Bread'])
    const food = (await (
      await app.request('/v1/materials?locale=ru&category=food')
    ).json()) as { items: { name: string }[] }
    expect(food.items.map((i) => i.name)).toEqual(['Bread'])
  })
  it('unknown category is an empty list, not an error', async () => {
    const res = await app.request('/v1/materials?category=x')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [] })
  })
  it('rejects bad locale', async () => {
    expect((await app.request('/v1/materials?locale=xx')).status).toBe(400)
    expect((await app.request('/v1/materials')).status).toBe(200)
  })
})

describe('POST /admin/sync', () => {
  const post = (path = '/admin/sync', token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

  it('401 without or with a wrong token', async () => {
    expect((await post()).status).toBe(401)
    expect((await post('/admin/sync', 'nope')).status).toBe(401)
  })
  it('202 with runId, passing full', async () => {
    const res = await post(
      '/admin/sync?full=1',
      'secret-secret-secret-secret-secret-00',
    )
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ runId: 1 })
    expect(triggerOpts).toEqual({ full: true })
  })
  it('409 when busy', async () => {
    triggerResult = 'busy'
    const res = await post(
      '/admin/sync',
      'secret-secret-secret-secret-secret-00',
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'sync_running' })
  })
  it('500 when the controller rejects', async () => {
    triggerResult = new Error('db down')
    const res = await post(
      '/admin/sync',
      'secret-secret-secret-secret-secret-00',
    )
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'sync_failed_to_start' })
  })
})

describe('list ordering', () => {
  it('breaks rarity+name ties by id asc for all list endpoints', async () => {
    // inserted in reverse id order so insertion order cannot satisfy the test
    for (const id of ['20000000-b', '20000000-a']) {
      await seedChar(id, 'pyro', 5, { en: 'Traveler' })
      await db.insert(weapons).values({
        id: `w${id}`,
        rarity: 3,
        weaponType: 'sword',
        sourceHash: 'h',
      })
      await db
        .insert(weaponI18n)
        .values({ weaponId: `w${id}`, locale: 'en', name: 'Same', details: {} })
      await db
        .insert(materials)
        .values({ id: `m${id}`, rarity: 1, category: 'c', sourceHash: 'h' })
      await db
        .insert(materialI18n)
        .values({ materialId: `m${id}`, locale: 'en', name: 'Same' })
    }
    const ids = async (path: string) => {
      const res = await app.request(path)
      const { items } = (await res.json()) as { items: { id: string }[] }
      return items.map((i) => i.id)
    }
    expect(
      (await ids('/v1/characters?locale=en')).filter((i) =>
        i.startsWith('20000000'),
      ),
    ).toEqual(['20000000-a', '20000000-b'])
    expect(await ids('/v1/weapons?locale=en')).toEqual([
      'w20000000-a',
      'w20000000-b',
    ])
    expect(await ids('/v1/materials?locale=en')).toEqual([
      'm20000000-a',
      'm20000000-b',
    ])
  })
})
