import { createDb, siteAssets } from '@gi/db'
import { resetDb } from '@gi/db/test-utils'
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createApp } from '../app'
import { parseEnv } from '../env'
import { createMemoryStore } from '../media/memory-store'

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
const app = createApp({
  db,
  env,
  store,
  sync: {
    async trigger() {
      throw new Error('unused')
    },
  },
})

beforeEach(async () => {
  await resetDb(db)
})
afterAll(async () => {
  await close()
})

describe('GET /v1/site/home-backgrounds', () => {
  it('returns {items: []} for an empty table', async () => {
    const res = await app.request('/v1/site/home-backgrounds')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [] })
  })

  it('returns absolute urls ordered by sortOrder, only the home-background group', async () => {
    await db.insert(siteAssets).values([
      {
        group: 'home-background',
        r2Key: 'site/home-background/b.webp',
        width: 2,
        height: 1,
        contentHash: 'b',
        sortOrder: 2,
      },
      {
        group: 'home-background',
        r2Key: 'site/home-background/a.webp',
        width: 1,
        height: 1,
        contentHash: 'a',
        sortOrder: 1,
      },
      {
        group: 'other',
        r2Key: 'site/other/c.webp',
        width: 3,
        height: 3,
        contentHash: 'c',
        sortOrder: 0,
      },
    ])
    const res = await app.request('/v1/site/home-backgrounds')
    expect(await res.json()).toEqual({
      items: [
        {
          url: 'http://media.test/gi-media/site/home-background/a.webp',
          width: 1,
          height: 1,
        },
        {
          url: 'http://media.test/gi-media/site/home-background/b.webp',
          width: 2,
          height: 1,
        },
      ],
    })
  })

  it('uses its own Cache-Control, leaving other routes unchanged', async () => {
    const res = await app.request('/v1/site/home-backgrounds')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(res.headers.get('etag')).toBeTruthy()
    const other = await app.request('/v1/weapons')
    expect(other.headers.get('cache-control')).toBe(
      'public, max-age=300, s-maxage=3600',
    )
  })
})
