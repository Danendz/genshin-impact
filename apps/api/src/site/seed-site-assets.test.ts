import { createDb, siteAssets } from '@gi/db'
import { resetDb } from '@gi/db/test-utils'
import { asc } from 'drizzle-orm'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createMemoryStore } from '../media/memory-store'
import { seedSiteAssets } from './seed-site-assets'

const { db, close } = createDb(inject('dbUrl'))

beforeEach(async () => {
  await resetDb(db)
})
afterAll(async () => {
  await close()
})

async function img(r: number, g: number, b: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: 16, height: 9, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer()
  return new Uint8Array(buf)
}

async function three(names = ['0', '1', '2']) {
  return [
    { name: names[0], bytes: await img(255, 0, 0) },
    { name: names[1], bytes: await img(0, 255, 0) },
    { name: names[2], bytes: await img(0, 0, 255) },
  ] as { name: string; bytes: Uint8Array }[]
}

describe('seedSiteAssets', () => {
  it('uploads 3 images as rows and keys under site/<group>/', async () => {
    const store = createMemoryStore()
    const res = await seedSiteAssets(
      { db, store },
      'home-background',
      await three(),
    )
    expect(res).toEqual({ uploaded: 3, skipped: 0 })
    const rows = await db.select().from(siteAssets)
    expect(rows).toHaveLength(3)
    expect(store.keys()).toHaveLength(3)
    for (const k of store.keys())
      expect(k).toMatch(/^site\/home-background\/[0-9a-f]{12}\.webp$/)
    expect(rows[0]).toMatchObject({ width: 16, height: 9 })
  })

  it('skips already-seeded files on re-run', async () => {
    const store = createMemoryStore()
    const files = await three()
    await seedSiteAssets({ db, store }, 'home-background', files)
    const res = await seedSiteAssets({ db, store }, 'home-background', files)
    expect(res).toEqual({ uploaded: 0, skipped: 3 })
    expect(await db.select().from(siteAssets)).toHaveLength(3)
  })

  it('orders numerically by file name, not lexically', async () => {
    const files = await three(['10', '2', '1'])
    await seedSiteAssets(
      { db, store: createMemoryStore() },
      'home-background',
      files,
    )
    const rows = await db
      .select()
      .from(siteAssets)
      .orderBy(asc(siteAssets.sortOrder))
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 2, 10])
  })

  it('falls back to alphabetical order for non-numeric names', async () => {
    const files = await three(['b', 'c', 'a'])
    await seedSiteAssets(
      { db, store: createMemoryStore() },
      'home-background',
      files,
    )
    const rows = await db.select().from(siteAssets)
    const byHash = new Map(rows.map((r) => [r.sortOrder, r]))
    expect([...byHash.keys()].sort()).toEqual([0, 1, 2])
  })
})
