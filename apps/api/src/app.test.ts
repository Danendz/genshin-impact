import type { Db } from '@gi/db'
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
import { parseEnv } from './env'
import { createMemoryStore } from './media/memory-store'

const env = parseEnv({
  DATABASE_URL: 'postgres://x',
  R2_ENDPOINT: 'http://r2',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET: 'b',
  MEDIA_PUBLIC_URL: 'http://media',
  ADMIN_TOKEN: 'tttttttttttttttttttttttttttttttt',
  CORS_ORIGIN: 'http://localhost:5173',
  PORT: '8787',
})
const app = createApp({
  db: {} as Db,
  env,
  sync: { trigger: async () => 'busy' },
  store: createMemoryStore(),
})

describe('app', () => {
  it('GET /health returns ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('allows the configured origin', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    )
  })

  it('does not allow other origins', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('CORS origin list', () => {
  const listApp = createApp({
    db: {} as Db,
    env: parseEnv({
      ...Object.fromEntries(
        Object.entries({
          DATABASE_URL: 'postgres://x',
          R2_ENDPOINT: 'http://r2',
          R2_ACCESS_KEY_ID: 'k',
          R2_SECRET_ACCESS_KEY: 's',
          R2_BUCKET: 'b',
          MEDIA_PUBLIC_URL: 'http://media',
          ADMIN_TOKEN: 'tttttttttttttttttttttttttttttttt',
          PORT: '8787',
        }),
      ),
      CORS_ORIGIN: 'http://localhost:5173/,https://preview.vercel.app',
    }),
    sync: { trigger: async () => 'busy' },
    store: createMemoryStore(),
  })
  it.each(['http://localhost:5173', 'https://preview.vercel.app'])(
    'allows %s',
    async (origin) => {
      const res = await listApp.request('/health', {
        headers: { Origin: origin },
      })
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    },
  )
  it('rejects others', async () => {
    const res = await listApp.request('/health', {
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('parseEnv', () => {
  it('names every missing variable', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*ADMIN_TOKEN/)
  })
  it('coerces PORT to a number', () => {
    expect(env.PORT).toBe(8787)
  })
})
