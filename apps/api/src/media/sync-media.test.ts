import { createDb, mediaAssets } from '@gi/db'
import { resetDb } from '@gi/db/test-utils'
import sharp from 'sharp'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest'
import { createMemoryStore } from './memory-store'
import { syncMedia } from './sync-media'

const { db, close } = createDb(inject('dbUrl'))
const owner = { type: 'character', id: '10000073' } as const
const refs = [
  { kind: 'icon', url: 'https://cdn.test/icon.png' },
  { kind: 'gacha_splash', url: 'https://cdn.test/splash.png' },
] as const

let png: Uint8Array
beforeAll(async () => {
  png = new Uint8Array(
    await sharp({
      create: { width: 4, height: 3, channels: 3, background: '#c33' },
    })
      .png()
      .toBuffer(),
  )
})
beforeEach(() => resetDb(db))
afterAll(() => close())

function makeFetch(missing: string[] = []) {
  const calls: string[] = []
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (missing.includes(url)) return new Response('nope', { status: 404 })
    return new Response(png, { status: 200 })
  }) as typeof fetch
  return { fetchFn, calls }
}

describe('syncMedia', () => {
  it('uploads refs and inserts rows with webp keys', async () => {
    const store = createMemoryStore()
    const { fetchFn } = makeFetch()
    const res = await syncMedia(
      { db, store, fetch: fetchFn },
      owner,
      [...refs],
      {
        force: false,
      },
    )
    expect(res).toEqual({ uploaded: 2, skipped: 0, missing: 0 })
    const rows = await db.select().from(mediaAssets)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.r2Key).toMatch(
        /^character\/10000073\/(icon|gacha_splash)-[0-9a-f]{12}\.webp$/,
      )
      expect(r.width).toBe(4)
      expect(r.height).toBe(3)
    }
    expect(rows.find((r) => r.kind === 'icon')?.r2Key).toMatch(
      /^character\/10000073\/icon-[0-9a-f]{12}\.webp$/,
    )
    expect(store.keys()).toHaveLength(2)
  })

  it('skips unchanged refs on second run', async () => {
    const store = createMemoryStore()
    const { fetchFn, calls } = makeFetch()
    const deps = { db, store, fetch: fetchFn }
    await syncMedia(deps, owner, [...refs], { force: false })
    const before = store.keys().length
    calls.length = 0
    const res = await syncMedia(deps, owner, [...refs], { force: false })
    expect(res).toEqual({ uploaded: 0, skipped: 2, missing: 0 })
    expect(calls).toHaveLength(0)
    expect(store.keys()).toHaveLength(before)
  })

  it('force re-uploads, same key, one row per kind', async () => {
    const store = createMemoryStore()
    const { fetchFn } = makeFetch()
    const deps = { db, store, fetch: fetchFn }
    await syncMedia(deps, owner, [...refs], { force: false })
    const first = await db.select().from(mediaAssets)
    const res = await syncMedia(deps, owner, [...refs], { force: true })
    expect(res).toEqual({ uploaded: 2, skipped: 0, missing: 0 })
    const second = await db.select().from(mediaAssets)
    expect(second).toHaveLength(2)
    const key = (rows: typeof first, k: string) =>
      rows.find((r) => r.kind === k)?.r2Key
    expect(key(second, 'icon')).toBe(key(first, 'icon'))
  })

  it('counts 404 as missing and still uploads the rest', async () => {
    const store = createMemoryStore()
    const { fetchFn } = makeFetch([refs[0].url])
    const res = await syncMedia(
      { db, store, fetch: fetchFn },
      owner,
      [...refs],
      {
        force: false,
      },
    )
    expect(res).toEqual({ uploaded: 1, skipped: 0, missing: 1 })
    expect(await db.select().from(mediaAssets)).toHaveLength(1)
  })

  it('throws on non-404 errors', async () => {
    const store = createMemoryStore()
    const fetchFn = (async () =>
      new Response('x', { status: 500 })) as typeof fetch
    await expect(
      syncMedia({ db, store, fetch: fetchFn }, owner, [refs[0]], {
        force: false,
      }),
    ).rejects.toThrow()
  })
})
