import {
  characterI18n,
  characters,
  createDb,
  materialI18n,
  materials,
  mediaAssets,
  syncRuns,
  weaponI18n,
  weapons,
} from '@gi/db'
import { resetDb } from '@gi/db/test-utils'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest'
import { createMemoryStore } from '../media/memory-store'
import { createSyncController } from './controller'
import { IGNORED_CHARACTER_IDS, runSync } from './run-sync'
import {
  type CharacterRecord,
  type GameDataSource,
  type ListEntry,
  type MaterialRecord,
  SourceEntityError,
  type WeaponRecord,
} from './source'

const { db, sql, close } = createDb(inject('dbUrl'))

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

const ok = (async () => new Response(png, { status: 200 })) as typeof fetch

const char = (id: string, name = id): CharacterRecord => ({
  id,
  rarity: 5,
  element: 'pyro',
  weaponType: 'sword',
  region: null,
  birthday: [3, 14],
  releaseAt: null,
  i18n: {
    en: {
      name,
      title: 't',
      description: 'd',
      details: { talents: [], constellations: [] },
    },
    ru: {
      name: `${name}-ru`,
      title: null,
      description: null,
      details: { talents: [], constellations: [] },
    },
  },
  media: [{ kind: 'icon', url: `https://cdn.test/${id}.png` }],
})
const weapon = (id: string): WeaponRecord => ({
  id,
  rarity: 4,
  weaponType: 'sword',
  i18n: {
    en: { name: id, description: null, details: { affix: null } },
    ru: { name: `${id}-ru`, description: null, details: { affix: null } },
  },
  media: [{ kind: 'icon', url: `https://cdn.test/${id}.png` }],
})
const material = (id: string): MaterialRecord => ({
  id,
  rarity: 1,
  category: 'cat',
  i18n: {
    en: { name: id, description: null },
    ru: { name: `${id}-ru`, description: null },
  },
  media: [{ kind: 'icon', url: `https://cdn.test/${id}.png` }],
})

function fakeSource(over: Partial<GameDataSource> = {}) {
  const state = {
    chars: [char('10000005-pyro'), char('10000002')],
    hashes: { '10000005-pyro': 'h1', '10000002': 'h2' } as Record<
      string,
      string
    >,
    weapons: [weapon('11101')],
    mats: [material('101'), material('102')],
    skipped: [] as { id: string; reason: string }[],
  }
  const getCharacter = vi.fn(async (id: string) => {
    const c = state.chars.find((x) => x.id === id)
    if (!c) throw new SourceEntityError(id, 'gone')
    return c
  })
  const source: GameDataSource = {
    listCharacters: async (): Promise<ListEntry[]> =>
      state.chars.map((c) => ({
        id: c.id,
        listHash: state.hashes[c.id] ?? 'x',
      })),
    getCharacter,
    listWeapons: async () =>
      state.weapons.map((w) => ({ id: w.id, listHash: `w-${w.id}` })),
    getWeapon: async (id) =>
      state.weapons.find((w) => w.id === id) as WeaponRecord,
    listMaterials: async () => ({
      records: state.mats,
      skipped: state.skipped,
    }),
    ...over,
  }
  return { state, source, getCharacter }
}

const deps = (source: GameDataSource, f: typeof fetch = ok) => ({
  db,
  sql,
  source,
  store: createMemoryStore(),
  fetch: f,
  log: () => {},
})

describe('runSync', () => {
  it('syncs an empty db', async () => {
    const { source } = fakeSource()
    const res = await runSync(deps(source))
    expect(res).not.toBe('busy')
    if (res === 'busy') return
    expect(res.status).toBe('succeeded')
    expect(res.counts).toEqual({
      characters: { upserted: 2, skipped: 0, failed: 0 },
      weapons: { upserted: 1, skipped: 0, failed: 0 },
      materials: { upserted: 2, skipped: 0, failed: 0 },
    })
    expect(await db.select().from(characterI18n)).toHaveLength(4)
    expect(await db.select().from(weaponI18n)).toHaveLength(2)
    expect(await db.select().from(materialI18n)).toHaveLength(4)
    expect(await db.select().from(mediaAssets)).toHaveLength(5)
    const [c] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, '10000005-pyro'))
    expect(c?.sourceHash).toBe('h1')
  })

  it('skips everything on an unchanged second run', async () => {
    const { source, getCharacter } = fakeSource()
    await runSync(deps(source))
    getCharacter.mockClear()
    const res = await runSync(deps(source))
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('succeeded')
    expect(res.counts.characters).toEqual({
      upserted: 0,
      skipped: 2,
      failed: 0,
    })
    expect(res.counts.weapons).toEqual({ upserted: 0, skipped: 1, failed: 0 })
    expect(getCharacter).not.toHaveBeenCalled()
  })

  it('refetches only the character whose listHash changed', async () => {
    const { source, state, getCharacter } = fakeSource()
    await runSync(deps(source))
    getCharacter.mockClear()
    state.hashes['10000002'] = 'changed'
    const res = await runSync(deps(source))
    if (res === 'busy') throw new Error('busy')
    expect(getCharacter).toHaveBeenCalledTimes(1)
    expect(getCharacter).toHaveBeenCalledWith('10000002')
    expect(res.counts.characters).toEqual({
      upserted: 1,
      skipped: 1,
      failed: 0,
    })
  })

  it('--full refetches everything', async () => {
    const { source, getCharacter } = fakeSource()
    await runSync(deps(source))
    getCharacter.mockClear()
    const res = await runSync(deps(source), { full: true })
    if (res === 'busy') throw new Error('busy')
    expect(getCharacter).toHaveBeenCalledTimes(2)
    expect(res.counts.characters.upserted).toBe(2)
  })

  it('removes i18n locales no longer present', async () => {
    const { source, state } = fakeSource()
    await runSync(deps(source))
    const c = state.chars[1] as CharacterRecord
    delete c.i18n.ru
    state.hashes['10000002'] = 'changed'
    await runSync(deps(source))
    const rows = await db
      .select()
      .from(characterI18n)
      .where(eq(characterI18n.characterId, '10000002'))
    expect(rows.map((r) => r.locale)).toEqual(['en'])
  })

  it('a failing character is partial; stored data stays unchanged', async () => {
    const { source, state } = fakeSource()
    await runSync(deps(source))
    state.hashes['10000002'] = 'changed'
    state.hashes['10000005-pyro'] = 'changed2'
    ;((state.chars[0] as CharacterRecord).i18n.en as { name: string }).name =
      'NEW'
    const res = await runSync(
      deps({
        ...source,
        getCharacter: async (id) => {
          if (id === '10000002') throw new SourceEntityError(id, 'bad shape')
          return source.getCharacter(id)
        },
      }),
    )
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('partial')
    expect(res.counts.characters).toEqual({
      upserted: 1,
      skipped: 0,
      failed: 1,
    })
    expect(res.failures).toEqual([
      {
        entity: 'character',
        id: '10000002',
        reason: expect.stringContaining('bad shape'),
      },
    ])
    const [ok1] = await db
      .select()
      .from(characterI18n)
      .where(eq(characterI18n.characterId, '10000005-pyro'))
    expect(ok1?.name).toBe('NEW')
    const [bad] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, '10000002'))
    expect(bad?.sourceHash).toBe('h2')
    expect(
      await db
        .select()
        .from(characterI18n)
        .where(eq(characterI18n.characterId, '10000002')),
    ).toHaveLength(2)
  })

  it('a failing list marks the run failed and deletes nothing', async () => {
    const { source } = fakeSource()
    await runSync(deps(source))
    const res = await runSync(
      deps({
        ...source,
        listWeapons: async () => {
          throw new Error('upstream down')
        },
      }),
    )
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('failed')
    expect(await db.select().from(weapons)).toHaveLength(1)
    expect(res.counts.characters.skipped).toBe(2)
    const [run] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, res.runId))
    expect(run?.status).toBe('failed')
    expect(run?.error).toContain('upstream down')
  })

  it('returns busy for exactly one of two concurrent runs, without a run row', async () => {
    const { source } = fakeSource({
      listCharacters: async () => {
        await new Promise((r) => setTimeout(r, 300))
        return []
      },
    })
    const results = await Promise.all([
      runSync(deps(source)),
      runSync(deps(source)),
    ])
    expect(results.filter((r) => r === 'busy')).toHaveLength(1)
    expect(await db.select().from(syncRuns)).toHaveLength(1)
  })

  it('finishes the syncRuns row with matching counts', async () => {
    const { source } = fakeSource()
    const res = await runSync(deps(source))
    if (res === 'busy') throw new Error('busy')
    const [run] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, res.runId))
    expect(run?.status).toBe('succeeded')
    expect(run?.finishedAt).not.toBeNull()
    expect(run?.counts).toEqual(res.counts)
  })

  it('counts skipped materials as failed (partial)', async () => {
    const { source, state } = fakeSource()
    state.skipped = [{ id: '999', reason: 'bad rarity' }]
    const res = await runSync(deps(source))
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('partial')
    expect(res.counts.materials).toEqual({ upserted: 2, skipped: 0, failed: 1 })
    expect(res.failures).toContainEqual({
      entity: 'material',
      id: '999',
      reason: 'bad rarity',
    })
  })

  it('ignores Manekin ids without fetching detail', async () => {
    expect(IGNORED_CHARACTER_IDS).toEqual(['10000117', '10000118'])
    const { source, state, getCharacter } = fakeSource()
    state.chars.push(char('10000117'))
    state.hashes['10000117'] = 'm'
    const res = await runSync(deps(source))
    if (res === 'busy') throw new Error('busy')
    expect(getCharacter).not.toHaveBeenCalledWith('10000117')
    expect(res.counts.characters).toEqual({
      upserted: 2,
      skipped: 1,
      failed: 0,
    })
    expect(res.status).toBe('succeeded')
  })

  it('media errors keep data, fail the entity, blank sourceHash; 404 is fine', async () => {
    const { source } = fakeSource()
    const f = (async (input: string | URL | Request) => {
      const u = String(input)
      if (u.includes('10000002')) return new Response('x', { status: 500 })
      if (u.includes('11101')) return new Response('x', { status: 404 })
      return new Response(png, { status: 200 })
    }) as typeof fetch
    const res = await runSync(deps(source, f))
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('partial')
    expect(res.counts.characters).toEqual({
      upserted: 1,
      skipped: 0,
      failed: 1,
    })
    expect(res.counts.weapons.failed).toBe(0)
    const [c] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, '10000002'))
    expect(c?.sourceHash).toBe('')
    expect(
      await db
        .select()
        .from(characterI18n)
        .where(eq(characterI18n.characterId, '10000002')),
    ).toHaveLength(2)
    expect(await db.select().from(materials)).toHaveLength(2)
  })

  it('wraps image fetches with a timeout signal', async () => {
    const { source } = fakeSource()
    const signals: (AbortSignal | null | undefined)[] = []
    const f = (async (_u: unknown, init?: RequestInit) => {
      signals.push(init?.signal)
      return new Response(png, { status: 200 })
    }) as typeof fetch
    await runSync({ ...deps(source, f), imageTimeoutMs: 5000 })
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true)
  })
})

describe('createSyncController', () => {
  it('returns a runId immediately and busy while running', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { source } = fakeSource({
      listCharacters: async () => {
        await gate
        return []
      },
    })
    const c = createSyncController(deps(source))
    const first = await c.trigger()
    expect(first).toEqual({ runId: expect.any(Number) })
    expect(await c.trigger()).toBe('busy')
    release()
    await vi.waitFor(async () => {
      const [run] = await db.select().from(syncRuns)
      expect(run?.status).toBe('succeeded')
    })
  })
})
