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
import { IGNORED_CHARACTER_IDS, runSync, SYNC_LOCK_KEY } from './run-sync'
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
  skillIcons: [],
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
  it('stores shared skill icons once by name; a 404 icon is not a failure', async () => {
    const { source, state } = fakeSource()
    const shared = {
      name: 'Skill_A_01',
      url: 'https://cdn.test/Skill_A_01.png',
    }
    const [a, b] = state.chars
    if (!a || !b) throw new Error('fixture')
    a.skillIcons = [
      shared,
      { name: 'Skill_404', url: 'https://cdn.test/Skill_404.png' },
    ]
    b.skillIcons = [shared]
    const f = (async (url: string) =>
      url.includes('Skill_404')
        ? new Response(null, { status: 404 })
        : new Response(png, { status: 200 })) as typeof fetch
    const res = await runSync(deps(source, f))
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('succeeded')
    const icons = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerType, 'skill_icon'))
    expect(icons.map((r) => [r.ownerId, r.kind])).toEqual([
      ['Skill_A_01', 'icon'],
    ])
  })

  it('a failing skill icon keeps the character and its other icons, and retries next run', async () => {
    const { source, state } = fakeSource()
    const [a] = state.chars
    if (!a) throw new Error('fixture')
    a.skillIcons = [
      { name: 'Skill_500', url: 'https://cdn.test/Skill_500.png' },
      { name: 'Skill_ok', url: 'https://cdn.test/Skill_ok.png' },
    ]
    const f = (async (url: string) =>
      url.includes('Skill_500')
        ? new Response('x', { status: 500 })
        : new Response(png, { status: 200 })) as typeof fetch
    const res = await runSync(deps(source, f))
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('partial')
    expect(res.counts.characters).toEqual({
      upserted: 2,
      skipped: 0,
      failed: 0,
    })
    expect(res.failures).toEqual([
      expect.objectContaining({ entity: 'skill_icon', id: 'Skill_500' }),
    ])
    const icons = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerType, 'skill_icon'))
    expect(icons.map((r) => r.ownerId)).toEqual(['Skill_ok'])
    const [c] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, a.id))
    // blank, so the next plain run fetches it again
    expect(c?.sourceHash).toBe('')
  })

  it('a full run downloads a shared skill icon once', async () => {
    const { source, state } = fakeSource()
    const shared = { name: 'Skill_S', url: 'https://cdn.test/Skill_S.png' }
    for (const c of state.chars) c.skillIcons = [shared]
    const f = vi.fn(ok)
    await runSync(deps(source, f as typeof fetch))
    f.mockClear()
    await runSync(deps(source, f as typeof fetch), { full: true })
    const iconCalls = f.mock.calls.filter(([u]) =>
      String(u).includes('Skill_S'),
    )
    expect(iconCalls).toHaveLength(1)
  })

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

  it('details run picks up detail-only changes; a plain run does not', async () => {
    const { source, state } = fakeSource()
    const d = deps(source)
    await runSync(d)
    const c = state.chars[1] as CharacterRecord
    ;(c.i18n.en as { description: string | null }).description = 'new text'
    const plain = await runSync(d)
    if (plain === 'busy') throw new Error('busy')
    expect(plain.counts.characters.upserted).toBe(0)
    const stored = () =>
      db
        .select()
        .from(characterI18n)
        .where(eq(characterI18n.characterId, '10000002'))
    expect((await stored()).find((r) => r.locale === 'en')?.description).toBe(
      'd',
    )
    const res = await runSync(d, { details: true })
    if (res === 'busy') throw new Error('busy')
    expect(res.counts.characters).toEqual({
      upserted: 1,
      skipped: 1,
      failed: 0,
    })
    expect((await stored()).find((r) => r.locale === 'en')?.description).toBe(
      'new text',
    )
  })

  it('details run does not force media; unchanged details run writes and uploads nothing', async () => {
    const { source } = fakeSource()
    const store = createMemoryStore()
    const fetchSpy = vi.fn(ok)
    const d = { ...deps(source, fetchSpy as unknown as typeof fetch), store }
    await runSync(d)
    fetchSpy.mockClear()
    const putSpy = vi.spyOn(store, 'put')
    const before = await db.select().from(characters)
    const res = await runSync(d, { details: true })
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('succeeded')
    expect(res.counts.characters.upserted).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    const mid = await db.select().from(characters)
    const again = await runSync(d, { details: true })
    if (again === 'busy') throw new Error('busy')
    expect(again.counts.characters).toEqual({
      upserted: 0,
      skipped: 2,
      failed: 0,
    })
    expect(again.counts.weapons.upserted).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(putSpy).not.toHaveBeenCalled()
    expect(await db.select().from(characters)).toEqual(mid)
    expect(before).toHaveLength(2)
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

  it('recovers abandoned running rows', async () => {
    const [old] = await db
      .insert(syncRuns)
      .values({ status: 'running', counts: {} })
      .returning({ id: syncRuns.id })
    const { source } = fakeSource()
    const res = await runSync(deps(source))
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('succeeded')
    const [row] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, (old as { id: number }).id))
    expect(row?.status).toBe('failed')
    expect(row?.error).toBe('abandoned')
    expect(row?.finishedAt).not.toBeNull()
  })

  it('a failing hash update is a partial entity failure, not a crash', async () => {
    const { source } = fakeSource()
    const flaky = new Proxy(db, {
      get(t, p, r) {
        if (p === 'update')
          return (table: unknown) => {
            if (table === characters) throw new Error('hash write failed')
            return t.update(table as typeof syncRuns)
          }
        return Reflect.get(t, p, r)
      },
    })
    const res = await runSync({ ...deps(source), db: flaky })
    if (res === 'busy') throw new Error('busy')
    expect(res.status).toBe('partial')
    expect(res.counts.characters.failed).toBe(2)
    expect(res.counts.weapons.upserted).toBe(1)
    const [c] = await db.select().from(characters).limit(1)
    expect(c?.sourceHash).toBe('')
    const [lock] =
      await sql`select pg_try_advisory_lock(${SYNC_LOCK_KEY}) as ok`
    expect(lock?.ok).toBe(true)
    await sql`select pg_advisory_unlock(${SYNC_LOCK_KEY})`
  })

  it('a hung image fetch fails the entity within the configured timeout', async () => {
    const { source } = fakeSource()
    // never resolves on its own; only rejects when the passed signal aborts
    const hung = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        )
      })) as typeof fetch
    const started = Date.now()
    const res = await runSync({ ...deps(source, hung), imageTimeoutMs: 50 })
    if (res === 'busy') throw new Error('busy')
    expect(Date.now() - started).toBeLessThan(3000)
    expect(res.status).toBe('partial')
    expect(res.counts.characters.failed).toBe(2)
    expect(res.counts.weapons.failed).toBe(1)
    expect(res.failures.length).toBeGreaterThan(0)
    const [c] = await db.select().from(characters).limit(1)
    expect(c?.sourceHash).toBe('')
  })
})

describe('createSyncController', () => {
  const controllerDeps = (source: GameDataSource) => {
    const { source: _, ...rest } = deps(source)
    return { ...rest, createSource: () => source }
  }

  it('creates a fresh source for every run, so lists are never stale', async () => {
    const { source } = fakeSource()
    const createSource = vi.fn(() => source)
    const c = createSyncController({ ...controllerDeps(source), createSource })
    await c.trigger()
    await c.idle?.()
    await c.trigger({ details: true })
    await c.idle?.()
    expect(createSource).toHaveBeenCalledTimes(2)
    const runs = await db.select().from(syncRuns)
    expect(runs.map((r) => r.status)).toEqual(['succeeded', 'succeeded'])
  })

  it('returns a runId immediately and busy while running', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { source } = fakeSource({
      listCharacters: async () => {
        await gate
        return []
      },
    })
    const c = createSyncController(controllerDeps(source))
    const first = await c.trigger()
    expect(first).toEqual({ runId: expect.any(Number) })
    expect(await c.trigger()).toBe('busy')
    release()
    await vi.waitFor(async () => {
      const [run] = await db.select().from(syncRuns)
      expect(run?.status).toBe('succeeded')
    })
  })

  it('rejects on a real error before the run starts', async () => {
    const { source } = fakeSource()
    const c = createSyncController({
      ...controllerDeps(source),
      sql: {
        reserve: async () => {
          throw new Error('db down')
        },
      } as unknown as typeof sql,
    })
    await expect(c.trigger()).rejects.toThrow('db down')
  })

  it("resolves 'busy' only when the lock is held", async () => {
    const { source } = fakeSource()
    const conn = await sql.reserve()
    try {
      await conn`select pg_try_advisory_lock(${SYNC_LOCK_KEY})`
      expect(await createSyncController(controllerDeps(source)).trigger()).toBe(
        'busy',
      )
    } finally {
      await conn`select pg_advisory_unlock(${SYNC_LOCK_KEY})`
      conn.release()
    }
  })
})
