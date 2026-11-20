import {
  characterI18n,
  characters,
  createDb,
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
  ADMIN_TOKEN: 'secret',
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
    const body = await res.json()
    expect(body).toMatchObject({
      element: 'pyro',
      locale: 'en',
      name: 'Diluc',
    })
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=300, s-maxage=3600',
    )
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
    await db
      .insert(weaponI18n)
      .values({ weaponId: 'w1', locale: 'en', name: 'Blade', details: {} })
    const list = (await (
      await app.request('/v1/weapons?locale=ru&weaponType=sword')
    ).json()) as { items: { name: string }[] }
    expect(list.items[0]?.name).toBe('Blade')
    const d = await app.request('/v1/weapons/w1?locale=ru')
    expect(await d.json()).toMatchObject({ locale: 'en', name: 'Blade' })
    expect((await app.request('/v1/weapons/zzz')).status).toBe(404)
  })
})

describe('materials', () => {
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
    const res = await post('/admin/sync?full=1', 'secret')
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ runId: 1 })
    expect(triggerOpts).toEqual({ full: true })
  })
  it('409 when busy', async () => {
    triggerResult = 'busy'
    const res = await post('/admin/sync', 'secret')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'sync_running' })
  })
  it('500 when the controller rejects', async () => {
    triggerResult = new Error('db down')
    const res = await post('/admin/sync', 'secret')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'sync_failed_to_start' })
  })
})
