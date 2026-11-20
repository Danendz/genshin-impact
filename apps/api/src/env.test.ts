import { describe, expect, it } from 'vitest'
import { parseCliEnv, parseEnv } from './env'

const good = {
  DATABASE_URL: 'postgres://gi:gi@localhost:54329/gi',
  R2_ENDPOINT: 'http://localhost:9000',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET: 'b',
  MEDIA_PUBLIC_URL: 'http://localhost:9000/gi-media/',
  ADMIN_TOKEN: 'a'.repeat(32),
  CORS_ORIGIN: 'http://localhost:5173/',
  PORT: '8787',
}

describe('parseEnv', () => {
  it('accepts postgres:// and postgresql:// URLs', () => {
    expect(parseEnv(good).DATABASE_URL).toBe(good.DATABASE_URL)
    expect(
      parseEnv({ ...good, DATABASE_URL: 'postgresql://u:p@h.internal:5432/d' })
        .DATABASE_URL,
    ).toContain('postgresql://')
  })

  it.each(['DATABASE_URL', 'R2_ENDPOINT', 'MEDIA_PUBLIC_URL', 'CORS_ORIGIN'])(
    'rejects an invalid URL in %s, naming it',
    (name) => {
      expect(() => parseEnv({ ...good, [name]: 'not a url' })).toThrow(name)
    },
  )

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() =>
      parseEnv({ ...good, DATABASE_URL: 'http://localhost/gi' }),
    ).toThrow('DATABASE_URL')
  })

  it('normalizes trailing slashes', () => {
    const env = parseEnv(good)
    expect(env.MEDIA_PUBLIC_URL).toBe('http://localhost:9000/gi-media')
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173'])
  })

  it('parses a comma-separated CORS_ORIGIN list', () => {
    const env = parseEnv({
      ...good,
      CORS_ORIGIN: 'http://localhost:5173/, https://x.vercel.app ,',
    })
    expect(env.CORS_ORIGIN).toEqual([
      'http://localhost:5173',
      'https://x.vercel.app',
    ])
    expect(() =>
      parseEnv({ ...good, CORS_ORIGIN: 'http://ok.test,nope' }),
    ).toThrow('CORS_ORIGIN')
  })

  it('rejects a short ADMIN_TOKEN', () => {
    expect(() => parseEnv({ ...good, ADMIN_TOKEN: 'short' })).toThrow(
      'ADMIN_TOKEN',
    )
  })
})

describe('parseCliEnv', () => {
  it('validates URLs and normalizes MEDIA_PUBLIC_URL', () => {
    expect(parseCliEnv(good).MEDIA_PUBLIC_URL).toBe(
      'http://localhost:9000/gi-media',
    )
    expect(() => parseCliEnv({ ...good, R2_ENDPOINT: 'nope' })).toThrow(
      'R2_ENDPOINT',
    )
    expect(() => parseCliEnv({ ...good, DATABASE_URL: 'x' })).toThrow(
      'DATABASE_URL',
    )
  })
})
