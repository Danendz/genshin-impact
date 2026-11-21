import {
  characterI18n,
  characterModels,
  characters,
  createDb,
  mediaAssets,
  syncRuns,
} from '@gi/db'
import { resetDb } from '@gi/db/test-utils'
import type { buildVariantFrom } from '@gi/models'
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
} from 'vitest'
import { createMemoryStore } from '../media/memory-store'
import { findOrphans } from './gc'
import { runModelsSync } from './run-models-sync'
import {
  AuthError,
  type SourceAsset,
  type SourceCharacter,
  type SourceClient,
} from './source-client'

const { db, sql, close } = createDb(inject('dbUrl'))
const h = (c: string) => c.repeat(32)

let png: Uint8Array
beforeAll(async () => {
  png = new Uint8Array(
    await sharp({
      create: { width: 4, height: 4, channels: 4, background: '#3c3' },
    })
      .png()
      .toBuffer(),
  )
})
beforeEach(() => resetDb(db))
afterAll(() => close())

const roster: SourceCharacter[] = [
  { id: 'c1', slug: 'citlali', name: 'Citlali', hasModel: true },
  {
    id: 'c2',
    slug: 'traveler-aether',
    name: 'Traveler (Aether)',
    hasModel: true,
  },
  { id: 'c3', slug: 'new-one', name: 'New One', hasModel: false },
]

const viewer = (...hashes: string[]) => ({
  model: { viewer: { format: 1, model: hashes[0], anim: hashes[1] } },
})

function files(slug: string, mainHashes: string[]): SourceAsset[] {
  const name = roster.find((c) => c.slug === slug)?.name as string
  return [
    {
      id: `${slug}-m`,
      role: 'model',
      extension: 'glb',
      metadata: viewer(...mainHashes),
    },
    {
      id: `${slug}-o`,
      role: 'model.outfit.xia',
      extension: 'glb',
      name: `${name} · Outfit 3D model`,
      metadata: viewer(h('e')),
    },
    {
      id: `${slug}-icon`,
      role: 'icon.avatar',
      extension: 'png',
      name: `${name} · Icon`,
    },
    {
      id: `${slug}-side`,
      role: 'icon.side',
      extension: 'png',
      name: `${name} · Side icon`,
    },
    {
      id: `${slug}-tcg`,
      role: 'art.tcg',
      extension: 'png',
      name: `${name} · TCG card`,
    },
    {
      id: `${slug}-c1`,
      role: 'constellation.1',
      extension: 'png',
      name: `${name} · Constellation 1`,
    },
  ]
}

function fakeClient(
  opts: { cookie?: boolean; authFails?: boolean; hashes?: string[] } = {},
) {
  const calls = { containers: [] as string[], downloads: [] as string[] }
  const client = {
    hasCookie: opts.cookie ?? false,
    characters: async () => roster,
    character: async (slug: string) => ({
      files: files(slug, opts.hashes ?? [h('a'), h('b')]),
    }),
    weapons: async () => ({
      defaultSetId: 'w',
      weapons: [{ setId: 'w', name: 'Sword', model: { viewer: h('f') } }],
    }),
    containers: async (hashes: string[]) => {
      calls.containers.push(...hashes)
      return new Map(hashes.map((x) => [x, Uint8Array.of(1)]))
    },
    originalUrls: async (_: string, assets: SourceAsset[]) => {
      if (opts.authFails) throw new AuthError('rejected')
      return new Map(assets.map((a) => [a.id, `https://orig.test/${a.id}`]))
    },
    previewUrl: (id: string) => `https://preview.test/${id}`,
    download: async (url: string) => {
      calls.downloads.push(url)
      return png
    },
  } as unknown as SourceClient
  return { client, calls }
}

const fakeBuild: typeof buildVariantFrom = async ({ variant, containers }) => ({
  variant,
  kind: variant === 'default' ? 'avatar' : 'monster',
  glb: Uint8Array.of(
    variant.length,
    ...containers.map((c) => c.id.charCodeAt(0)),
  ),
  weapons: variant === 'default' ? [Uint8Array.of(9)] : [],
  props: undefined,
  toon: {
    json: '{}\n',
    files: { 'body-diffuse.webp': Uint8Array.of(7) },
    missing: [],
  },
  clips: ['Idle'],
  sourceHashes: containers.map((c) => c.id).sort(),
  notes: [],
})

async function seedAmber() {
  for (const [id, name] of [
    ['10000107', 'Citlali'],
    ['10000005-anemo', 'Traveler'],
    ['10000005-geo', 'Traveler'],
  ] as const) {
    await db
      .insert(characters)
      .values({ id, rarity: 5, weaponType: 'catalyst', sourceHash: 'x' })
    await db
      .insert(characterI18n)
      .values({ characterId: id, locale: 'en', name, details: {} })
  }
}

describe('runModelsSync', () => {
  it('builds models, uploads kept images and links Amber characters', async () => {
    await seedAmber()
    const store = createMemoryStore()
    const { client } = fakeClient()
    const res = await runModelsSync({
      db,
      sql,
      client,
      store,
      build: fakeBuild,
    })
    if (res === 'busy') throw new Error('busy')

    expect(res.status).toBe('succeeded')
    expect(res.unmatched).toEqual(['new-one'])
    const linked = await db
      .select({ id: characters.id, slug: characters.modelSlug })
      .from(characters)
    expect(Object.fromEntries(linked.map((r) => [r.id, r.slug]))).toEqual({
      '10000107': 'citlali',
      '10000005-anemo': 'traveler-aether',
      '10000005-geo': 'traveler-aether',
    })

    const models = await db.select().from(characterModels)
    expect(models.map((m) => `${m.modelSlug}/${m.variant}`).sort()).toEqual([
      'citlali/Outfit',
      'citlali/default',
      'traveler-aether/Outfit',
      'traveler-aether/default',
    ])
    const main = models.find(
      (m) => m.modelSlug === 'citlali' && m.variant === 'default',
    )
    expect(main?.kind).toBe('avatar')
    expect(
      models.find((m) => m.modelSlug === 'citlali' && m.variant === 'Outfit')
        ?.kind,
    ).toBe('monster')
    expect(main?.sourceHashes).toEqual([h('a'), h('b'), h('f')])
    expect(main?.glbKey).toMatch(
      /^model\/citlali\/default\/model-[0-9a-f]{12}\.glb$/,
    )
    expect(main?.weaponKey).toMatch(/weapon-/)
    expect(store.keys()).toContain(`${main?.toonPrefix}toon.json`)
    expect(store.keys()).toContain(`${main?.toonPrefix}body-diffuse.webp`)

    // TCG art is skipped; icons and kit icons are kept, as previews without a cookie
    const media = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerId, 'citlali'))
    expect(media.map((m) => `${m.kind}:${m.variant}`).sort()).toEqual([
      'icon:',
      'kit:constellation.1',
      'side_icon:',
    ])
    expect(
      media.every((m) => m.quality === 'preview' && m.source === 'models'),
    ).toBe(true)
    // a cropped side icon goes back on the game's canvas; other icons keep their size
    const size = (kind: string) => {
      const m = media.find((x) => x.kind === kind)
      return [m?.width, m?.height]
    }
    expect(size('side_icon')).toEqual([128, 128])
    expect(size('icon')).toEqual([4, 4])
    // the model-less character still gets its images
    expect(
      await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.ownerId, 'new-one')),
    ).toHaveLength(3)

    const [run] = await db.select().from(syncRuns)
    expect(run).toMatchObject({ source: 'models', status: 'succeeded' })
  })

  it('skips everything on a second run and rebuilds only changed variants', async () => {
    const store = createMemoryStore()
    await runModelsSync({
      db,
      sql,
      client: fakeClient().client,
      store,
      build: fakeBuild,
    })

    const again = fakeClient()
    const second = await runModelsSync({
      db,
      sql,
      client: again.client,
      store,
      build: fakeBuild,
    })
    if (second === 'busy') throw new Error('busy')
    expect(second.counts.models.done).toBe(0)
    expect(second.counts.media.done).toBe(0)
    expect(again.calls.containers).toEqual([])

    const changed = fakeClient({ hashes: [h('a'), h('c')] })
    const third = await runModelsSync({
      db,
      sql,
      client: changed.client,
      store,
      build: fakeBuild,
    })
    if (third === 'busy') throw new Error('busy')
    expect(third.counts.models).toMatchObject({ done: 2, skipped: 2 })
  })

  it('upgrades previews once a working cookie is configured', async () => {
    const store = createMemoryStore()
    const opts = { skipModels: true }
    await runModelsSync({ db, sql, client: fakeClient().client, store }, opts)

    const rejected = fakeClient({ cookie: true, authFails: true })
    const bad = await runModelsSync(
      { db, sql, client: rejected.client, store },
      opts,
    )
    if (bad === 'busy') throw new Error('busy')
    expect(bad.status).toBe('partial')
    expect(bad.authFailed).toBe(true)
    const [badRun] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, bad.runId as number))
    expect(badRun?.error).toMatch(/cookie/)

    const good = fakeClient({ cookie: true })
    const ok = await runModelsSync(
      { db, sql, client: good.client, store },
      opts,
    )
    if (ok === 'busy') throw new Error('busy')
    expect(ok.counts.media.previews).toBe(0)
    expect(
      good.calls.downloads.every((u) => u.startsWith('https://orig.test/')),
    ).toBe(true)
    const rows = await db.select().from(mediaAssets)
    expect(rows.every((r) => r.quality === 'original')).toBe(true)
  })

  it('records non-rigged extras so they are not refetched', async () => {
    const store = createMemoryStore()
    const build: typeof buildVariantFrom = async (input) =>
      input.variant === 'default' ? fakeBuild(input) : undefined
    const res = await runModelsSync(
      { db, sql, client: fakeClient().client, store, build },
      { only: ['citlali'], skipMedia: true },
    )
    if (res === 'busy') throw new Error('busy')
    expect(res.counts.models).toMatchObject({ done: 1, notRigged: 1 })
    const [extra] = await db
      .select()
      .from(characterModels)
      .where(eq(characterModels.variant, 'Outfit'))
    expect(extra?.glbKey).toBeNull()
    expect(extra?.kind).toBeNull()
  })

  it('dry runs write nothing', async () => {
    const store = createMemoryStore()
    const res = await runModelsSync(
      { db, sql, client: fakeClient().client, store, build: fakeBuild },
      { dryRun: true },
    )
    if (res === 'busy') throw new Error('busy')
    expect(res.counts.models.done).toBe(4)
    expect(store.keys()).toEqual([])
    expect(await db.select().from(syncRuns)).toEqual([])
  })

  it('finds orphaned objects for gc', async () => {
    const store = createMemoryStore()
    await runModelsSync({
      db,
      sql,
      client: fakeClient().client,
      store,
      build: fakeBuild,
    })
    await store.put(
      'model/citlali/default/model-000000000000.glb',
      Uint8Array.of(1),
      'x',
    )
    await store.put('site/home/abc.webp', Uint8Array.of(1), 'x')
    expect(await findOrphans(db, store)).toEqual([
      'model/citlali/default/model-000000000000.glb',
    ])
  })
})
