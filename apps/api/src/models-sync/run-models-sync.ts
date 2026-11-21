// Models sync (twice a month): discover characters, rebuild 3D variants whose containers
// changed, upload the images we keep, and record everything for the API.
import { createHash } from 'node:crypto'
import {
  characterModels,
  type createDb,
  type Db,
  mediaAssets,
  syncRuns,
} from '@gi/db'
import {
  type BuiltVariant,
  buildVariantFrom,
  type Container,
  DEFAULT_VARIANT,
} from '@gi/models'
import { and, eq } from 'drizzle-orm'
import { mediaKey, processImage } from '../media/process-image'
import type { MediaStore } from '../media/store'
import type { LocalCache } from './local-cache'
import { matchCharacters } from './match'
import { type MediaSlot, mediaSlot } from './media-roles'
import {
  AuthError,
  collectHashes,
  elementOf,
  type SourceAsset,
  type SourceCharacter,
  type SourceClient,
} from './source-client'

/** pg_try_advisory_lock key; the Amber sync uses 8_420_731. */
export const MODELS_SYNC_LOCK_KEY = 8_420_732
const OWNER = 'model_character'
const CHARACTER_CONCURRENCY = 2
const IMAGE_CONCURRENCY = 6
const IMAGE_QUALITY = 90

export type ModelsSyncDeps = {
  db: Db
  sql: ReturnType<typeof createDb>['sql']
  client: SourceClient
  store: MediaStore
  /** already-downloaded containers/images (the bulk upload) */
  cache?: LocalCache
  log?: (msg: string) => void
  /** injectable for tests */
  build?: typeof buildVariantFrom
}

export type ModelsSyncOptions = {
  /** source slugs or names; default every character */
  only?: string[]
  /** rebuild and re-upload even if nothing changed */
  force?: boolean
  /** report what would change; writes nothing */
  dryRun?: boolean
  skipModels?: boolean
  skipMedia?: boolean
}

type Counts = { done: number; skipped: number; failed: number }
export type ModelsSyncResult = {
  runId: number | null
  status: 'succeeded' | 'partial' | 'failed'
  counts: {
    characters: Counts
    models: Counts & { notRigged: number }
    media: Counts & { previews: number }
  }
  failures: { id: string; reason: string }[]
  unmatched: string[]
  authFailed: boolean
}

const sha256 = (b: Uint8Array | string) =>
  createHash('sha256').update(b).digest('hex')
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** `Outfit 1` -> `outfit-1`, for R2 keys */
export const keySlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'x'

async function pool<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
) {
  let i = 0
  const worker = async () => {
    while (i < items.length) await fn(items[i++] as T)
  }
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, worker),
  )
}

export async function runModelsSync(
  deps: ModelsSyncDeps,
  opts: ModelsSyncOptions = {},
): Promise<ModelsSyncResult | 'busy'> {
  const conn = await deps.sql.reserve()
  try {
    const [lock] =
      await conn`select pg_try_advisory_lock(${MODELS_SYNC_LOCK_KEY}) as ok`
    if (!lock?.ok) return 'busy'
    try {
      return await execute(deps, opts)
    } finally {
      await conn`select pg_advisory_unlock(${MODELS_SYNC_LOCK_KEY})`
    }
  } finally {
    conn.release()
  }
}

async function execute(
  deps: ModelsSyncDeps,
  opts: ModelsSyncOptions,
): Promise<ModelsSyncResult> {
  const { db, client, store, cache } = deps
  const log = deps.log ?? (() => {})
  const build = deps.build ?? buildVariantFrom
  const dry = opts.dryRun ?? false
  const force = opts.force ?? false

  let runId: number | null = null
  if (!dry) {
    await db
      .update(syncRuns)
      .set({ status: 'failed', error: 'abandoned', finishedAt: new Date() })
      .where(and(eq(syncRuns.status, 'running'), eq(syncRuns.source, 'models')))
    const [run] = await db
      .insert(syncRuns)
      .values({ source: 'models', status: 'running', counts: {} })
      .returning({ id: syncRuns.id })
    runId = run?.id ?? null
  }

  const zero = (): Counts => ({ done: 0, skipped: 0, failed: 0 })
  const result: ModelsSyncResult = {
    runId,
    status: 'succeeded',
    counts: {
      characters: zero(),
      models: { ...zero(), notRigged: 0 },
      media: { ...zero(), previews: 0 },
    },
    failures: [],
    unmatched: [],
    authFailed: false,
  }
  const fail = (c: Counts, id: string, e: unknown) => {
    c.failed++
    result.failures.push({ id, reason: msg(e) })
    log(`${id} failed: ${msg(e)}`)
  }

  let fatal: string | null = null
  try {
    const roster = await client.characters()
    if (!dry) {
      const matched = await matchCharacters(db, roster)
      result.unmatched = matched.unmatched
      if (matched.updated)
        log(`linked ${matched.updated} Amber characters to the models source`)
      if (matched.unmatched.length) {
        log(`not in Amber (stored anyway): ${matched.unmatched.join(', ')}`)
      }
    }
    const wanted = opts.only?.map((s) => s.toLowerCase())
    const selected = wanted
      ? roster.filter(
          (c) =>
            wanted.includes(c.slug) || wanted.includes(c.name.toLowerCase()),
        )
      : roster
    if (wanted && selected.length !== wanted.length) {
      const known = new Set(
        selected.flatMap((c) => [c.slug, c.name.toLowerCase()]),
      )
      throw new Error(
        `unknown character(s): ${wanted.filter((w) => !known.has(w)).join(', ')}`,
      )
    }
    await pool(selected, CHARACTER_CONCURRENCY, async (character) => {
      try {
        await syncCharacter(character)
        result.counts.characters.done++
      } catch (e) {
        fail(result.counts.characters, character.slug, e)
      }
    })
  } catch (e) {
    fatal = msg(e)
    log(`fatal: ${fatal}`)
  }

  const anyFailed = result.failures.length > 0 || result.authFailed
  result.status = fatal ? 'failed' : anyFailed ? 'partial' : 'succeeded'
  if (runId !== null) {
    const error =
      fatal ??
      (result.authFailed ? 'models cookie rejected; saved previews' : null) ??
      result.failures[0]?.reason ??
      null
    await db
      .update(syncRuns)
      .set({
        status: result.status,
        counts: result.counts,
        error,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, runId))
  }
  return result

  async function syncCharacter(character: SourceCharacter) {
    const detail = await client.character(character.slug)
    const files = detail.files ?? []
    if (!opts.skipModels && character.hasModel) {
      const weapons = await client.weapons(character.id)
      await syncModels(character, files, weapons)
    }
    if (!opts.skipMedia) await syncMediaFor(character, files)
  }

  async function syncModels(
    character: SourceCharacter,
    files: SourceAsset[],
    weapons: Awaited<ReturnType<SourceClient['weapons']>>,
  ) {
    const sets = collectHashes(character.name, files, weapons)
    for (const p of sets.problems) log(`${character.slug}: note: ${p}`)
    const stored = new Map(
      (
        await db
          .select({
            variant: characterModels.variant,
            hashes: characterModels.sourceHashes,
          })
          .from(characterModels)
          .where(eq(characterModels.modelSlug, character.slug))
      ).map((r) => [r.variant, [...r.hashes].sort().join(',')]),
    )
    const variants: [string, string[]][] = [
      [DEFAULT_VARIANT, sets.main],
      ...Object.entries(sets.extras),
    ]
    const c = result.counts.models
    for (const [variant, hashes] of variants) {
      const id = `${character.slug}/${variant}`
      if (!hashes.length) continue
      if (!force && stored.get(variant) === [...hashes].sort().join(',')) {
        c.skipped++
        continue
      }
      if (dry) {
        log(`${id}: would build (${hashes.length} containers)`)
        c.done++
        continue
      }
      try {
        const containers = await loadContainers(hashes)
        const built = await build({
          name: character.name,
          element: elementOf(character),
          variant,
          containers,
        })
        if (!built) {
          if (variant === DEFAULT_VARIANT)
            throw new Error('no rigged character model')
          await saveModel(character.slug, variant, hashes, null)
          c.notRigged++
          continue
        }
        await saveModel(
          character.slug,
          variant,
          hashes,
          await uploadVariant(character.slug, built),
        )
        log(`${id}: built (${built.clips.length} clips)`)
        c.done++
      } catch (e) {
        fail(c, id, e)
      }
    }
  }

  async function loadContainers(hashes: string[]): Promise<Container[]> {
    const out = new Map<string, Uint8Array>()
    for (const h of hashes) {
      const local = cache?.container(h)
      if (local) out.set(h, local)
    }
    const missing = hashes.filter((h) => !out.has(h))
    if (missing.length)
      for (const [h, b] of await client.containers(missing)) out.set(h, b)
    return hashes.map((id) => ({ id, bytes: out.get(id) as Uint8Array }))
  }

  async function putOnce(key: string, body: Uint8Array, type: string) {
    if (force || !(await store.exists(key))) await store.put(key, body, type)
  }

  async function uploadVariant(slug: string, built: BuiltVariant) {
    const base = `model/${slug}/${keySlug(built.variant)}`
    const glbKey = (role: string, b: Uint8Array) =>
      `${base}/${role}-${sha256(b).slice(0, 12)}.glb`
    const keys = {
      glbKey: glbKey('model', built.glb),
      weaponKey: built.weapons[0] ? glbKey('weapon', built.weapons[0]) : null,
      propsKey: built.props ? glbKey('props', built.props) : null,
    }
    // The toon prefix is named after everything in it, so it's immutable too.
    const names = Object.keys(built.toon.files).sort()
    const toonHash = sha256(
      [
        built.toon.json,
        ...names.map(
          (n) => `${n}:${sha256(built.toon.files[n] as Uint8Array)}`,
        ),
      ].join('\n'),
    )
    const toonPrefix = `${base}/toon-${toonHash.slice(0, 12)}/`
    await putOnce(keys.glbKey, built.glb, 'model/gltf-binary')
    if (keys.weaponKey)
      await putOnce(
        keys.weaponKey,
        built.weapons[0] as Uint8Array,
        'model/gltf-binary',
      )
    if (keys.propsKey)
      await putOnce(
        keys.propsKey,
        built.props as Uint8Array,
        'model/gltf-binary',
      )
    await pool(names, IMAGE_CONCURRENCY, (n) =>
      putOnce(
        `${toonPrefix}${n}`,
        built.toon.files[n] as Uint8Array,
        'image/webp',
      ),
    )
    await putOnce(
      `${toonPrefix}toon.json`,
      new TextEncoder().encode(built.toon.json),
      'application/json',
    )
    const bytes =
      built.glb.length +
      (built.weapons[0]?.length ?? 0) +
      (built.props?.length ?? 0)
    return { ...keys, kind: built.kind, toonPrefix, clips: built.clips, bytes }
  }

  async function saveModel(
    slug: string,
    variant: string,
    hashes: string[],
    out: Awaited<ReturnType<typeof uploadVariant>> | null,
  ) {
    const values = {
      modelSlug: slug,
      variant,
      glbKey: out?.glbKey ?? null,
      kind: out?.kind ?? null,
      weaponKey: out?.weaponKey ?? null,
      propsKey: out?.propsKey ?? null,
      toonPrefix: out?.toonPrefix ?? null,
      clips: out?.clips ?? [],
      bytes: out?.bytes ?? 0,
      sourceHashes: [...hashes].sort(),
      updatedAt: new Date(),
    }
    await db
      .insert(characterModels)
      .values(values)
      .onConflictDoUpdate({
        target: [characterModels.modelSlug, characterModels.variant],
        set: values,
      })
  }

  async function syncMediaFor(
    character: SourceCharacter,
    files: SourceAsset[],
  ) {
    const c = result.counts.media
    const slots = new Map<string, { asset: SourceAsset; slot: MediaSlot }>()
    for (const asset of files) {
      const slot = mediaSlot(character.name, asset)
      const key = slot && `${slot.kind}|${slot.variant}`
      if (slot && key && !slots.has(key)) slots.set(key, { asset, slot })
    }
    const stored = new Map(
      (
        await db
          .select({
            kind: mediaAssets.kind,
            variant: mediaAssets.variant,
            sourceUrl: mediaAssets.sourceUrl,
            quality: mediaAssets.quality,
          })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.ownerType, OWNER),
              eq(mediaAssets.ownerId, character.slug),
            ),
          )
      ).map((r) => [`${r.kind}|${r.variant}`, r]),
    )
    const todo = [...slots.entries()].filter(([key, { asset }]) => {
      const row = stored.get(key)
      const fresh =
        row?.sourceUrl === sourceUrl(asset) &&
        (row.quality === 'original' || (!client.hasCookie && !cache))
      if (!force && fresh) c.skipped++
      return force || !fresh
    })
    if (!todo.length) return
    if (dry) {
      for (const [key] of todo) log(`${character.slug}: would upload ${key}`)
      c.done += todo.length
      return
    }

    // Prefer local originals, then signed originals, then public previews.
    const local = new Map<string, { bytes: Uint8Array; original: boolean }>()
    for (const [, { asset }] of todo) {
      const hit = cache?.image(character.name, files, asset)
      if (hit) local.set(asset.id, hit)
    }
    let originals = new Map<string, string>()
    const needOriginal = todo
      .map(([, { asset }]) => asset)
      .filter((a) => !local.get(a.id)?.original)
    if (client.hasCookie && needOriginal.length && !result.authFailed) {
      try {
        originals = await client.originalUrls(character.name, needOriginal)
      } catch (e) {
        if (!(e instanceof AuthError)) throw e
        result.authFailed = true
        log(`warning: ${msg(e)}; saving previews instead`)
      }
    }

    await pool(todo, IMAGE_CONCURRENCY, async ([key, { asset, slot }]) => {
      try {
        let bytes: Uint8Array
        let original: boolean
        const hit = local.get(asset.id)
        const url = originals.get(asset.id)
        if (hit?.original || (hit && !url)) ({ bytes, original } = hit)
        else if (url) {
          bytes = await client.download(url)
          original = true
        } else {
          bytes = await client.download(client.previewUrl(asset.id))
          original = false
        }
        const img = await processImage(bytes, IMAGE_QUALITY)
        const kind = slot.variant
          ? `${slot.kind}-${keySlug(slot.variant)}`
          : slot.kind
        const r2Key = mediaKey(OWNER, character.slug, kind, img.contentHash)
        await putOnce(r2Key, img.body, 'image/webp')
        const values = {
          ownerType: OWNER,
          ownerId: character.slug,
          kind: slot.kind,
          variant: slot.variant,
          label: slot.label,
          source: 'models',
          quality: original ? 'original' : 'preview',
          sourceUrl: sourceUrl(asset),
          r2Key,
          width: img.width,
          height: img.height,
          contentHash: img.contentHash,
          updatedAt: new Date(),
        } as const
        await db
          .insert(mediaAssets)
          .values(values)
          .onConflictDoUpdate({
            target: [
              mediaAssets.ownerType,
              mediaAssets.ownerId,
              mediaAssets.kind,
              mediaAssets.variant,
            ],
            set: values,
          })
        c.done++
        if (!original) c.previews++
      } catch (e) {
        fail(c, `${character.slug}/${key}`, e)
      }
    })
  }
}

const sourceUrl = (asset: SourceAsset) => `models:asset/${asset.id}`
