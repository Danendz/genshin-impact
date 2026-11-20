import { createHash } from 'node:crypto'
import {
  characters,
  type createDb,
  type Db,
  materials,
  syncRuns,
  weapons,
} from '@gi/db'
import { and, eq } from 'drizzle-orm'
import type { MediaStore } from '../media/store'
import { syncMedia } from '../media/sync-media'
import type { GameDataSource, ListEntry, MediaRef, SkillIcon } from './source'
import {
  setSourceHash,
  upsertCharacter,
  upsertMaterial,
  upsertWeapon,
} from './upsert'

/** Manekin / Manekina: null element, non-playable. */
export const IGNORED_CHARACTER_IDS = ['10000117', '10000118']

/** Arbitrary constant key for pg_try_advisory_lock. */
export const SYNC_LOCK_KEY = 8_420_731

const CONCURRENCY = 4

export type EntityCounts = { upserted: number; skipped: number; failed: number }
export type Failure = { entity: string; id: string; reason: string }
export type SyncResult = {
  runId: number
  status: 'succeeded' | 'partial' | 'failed'
  counts: {
    characters: EntityCounts
    weapons: EntityCounts
    materials: EntityCounts
  }
  failures: Failure[]
}

export type RunSyncDeps = {
  db: Db
  /** postgres.js instance; used to hold the advisory lock on one connection */
  sql: ReturnType<typeof createDb>['sql']
  source: GameDataSource
  store: MediaStore
  fetch: typeof fetch
  log?: (msg: string) => void
  /** per image request timeout, default 30s */
  imageTimeoutMs?: number
  /** called once the run row exists (not called when busy) */
  onStart?: (runId: number) => void
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v instanceof Date) return JSON.stringify(v.toISOString())
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++] as T
      try {
        await fn(item)
      } catch {
        // fn records its own failures; never let a worker reject the pool
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  )
}

export async function runSync(
  deps: RunSyncDeps,
  opts: { full?: boolean; details?: boolean } = {},
): Promise<SyncResult | 'busy'> {
  const { db, sql, source, store } = deps
  const log = deps.log ?? (() => {})
  const full = opts.full ?? false
  const details = opts.details ?? false
  const timeoutMs = deps.imageTimeoutMs ?? 30_000

  const conn = await sql.reserve()
  try {
    const [lock] =
      await conn`select pg_try_advisory_lock(${SYNC_LOCK_KEY}) as ok`
    if (!lock?.ok) return 'busy'
    try {
      return await execute()
    } finally {
      await conn`select pg_advisory_unlock(${SYNC_LOCK_KEY})`
    }
  } finally {
    conn.release()
  }

  async function execute(): Promise<SyncResult> {
    // holding the lock proves no other run is active: close out leftovers
    await db
      .update(syncRuns)
      .set({ status: 'failed', error: 'abandoned', finishedAt: new Date() })
      .where(and(eq(syncRuns.status, 'running'), eq(syncRuns.source, 'amber')))
    const [run] = await db
      .insert(syncRuns)
      .values({ status: 'running', counts: {} })
      .returning({ id: syncRuns.id })
    const runId = (run as { id: number }).id
    deps.onStart?.(runId)

    const zero = (): EntityCounts => ({ upserted: 0, skipped: 0, failed: 0 })
    const counts = {
      characters: zero(),
      weapons: zero(),
      materials: zero(),
    }
    const failures: Failure[] = []
    let listFailed = false

    const mediaFetch = ((
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) =>
      deps.fetch(input, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })) as typeof fetch
    const mediaDeps = { db, store, fetch: mediaFetch }

    const fail = (
      c: EntityCounts,
      entity: string,
      id: string,
      reason: string,
    ) => {
      c.failed++
      failures.push({ entity, id, reason })
      log(`${entity} ${id} failed: ${reason}`)
    }

    /**
     * Skill icons are shared by name across characters: each one is synced at
     * most once per run, and its failure is its own, not the character's.
     */
    const iconRuns = new Map<string, Promise<boolean>>()
    const syncIcon = (icon: SkillIcon) => {
      let run = iconRuns.get(icon.name)
      if (!run) {
        run = syncMedia(
          mediaDeps,
          { type: 'skill_icon', id: icon.name },
          [{ kind: 'icon', url: icon.url }],
          { force: full },
        ).then(
          () => true,
          (e) => {
            failures.push({
              entity: 'skill_icon',
              id: icon.name,
              reason: msg(e),
            })
            log(`skill_icon ${icon.name} failed: ${msg(e)}`)
            return false
          },
        )
        iconRuns.set(icon.name, run)
      }
      return run
    }

    /** Fetch + upsert + media for one entity; any error counts as entity failure. */
    async function syncEntity<
      R extends { id: string; media: MediaRef[]; skillIcons?: SkillIcon[] },
    >(
      kind: 'character' | 'weapon',
      c: EntityCounts,
      entry: ListEntry,
      get: (id: string) => Promise<R>,
      upsert: (rec: R, hash: string) => Promise<void>,
      prev?: { sourceHash: string; detailHash: string | null },
    ) {
      try {
        const record = await get(entry.id)
        const detailHash = sha256(stableStringify(record))
        if (
          details &&
          !full &&
          prev?.detailHash === detailHash &&
          prev.sourceHash === entry.listHash
        ) {
          c.skipped++
          return
        }
        // '' until media succeeds, so a crash anywhere in between retries next run
        await upsert(record, '')
        await syncMedia(mediaDeps, { type: kind, id: entry.id }, record.media, {
          force: full,
        })
        let iconsOk = true
        for (const icon of record.skillIcons ?? [])
          if (!(await syncIcon(icon))) iconsOk = false
        // a failed icon keeps the hash blank, so the next run retries it
        if (iconsOk)
          await setSourceHash(db, kind, entry.id, entry.listHash, detailHash)
        c.upserted++
      } catch (e) {
        fail(c, kind, entry.id, msg(e))
      }
    }

    async function syncList<R extends { id: string; media: MediaRef[] }>(
      kind: 'character' | 'weapon',
      c: EntityCounts,
      table: typeof characters | typeof weapons,
      list: () => Promise<ListEntry[]>,
      get: (id: string) => Promise<R>,
      upsert: (rec: R, hash: string) => Promise<void>,
      ignored: string[] = [],
    ) {
      let entries: ListEntry[]
      try {
        entries = await list()
      } catch (e) {
        listFailed = true
        failures.push({ entity: `${kind} list`, id: '*', reason: msg(e) })
        log(`${kind} list failed: ${msg(e)}`)
        return
      }
      const stored = new Map(
        (
          await db
            .select({
              id: table.id,
              sourceHash: table.sourceHash,
              detailHash: table.detailHash,
            })
            .from(table)
        ).map((r) => [r.id, r] as const),
      )
      const listed = new Set(entries.map((e) => e.id))
      const gone = [...stored.keys()].filter((id) => !listed.has(id))
      if (gone.length)
        log(`${kind}: ${gone.length} gone upstream (kept): ${gone.join(', ')}`)

      const todo: ListEntry[] = []
      let ignoredCount = 0
      for (const entry of entries) {
        if (ignored.includes(entry.id)) {
          c.skipped++
          ignoredCount++
        } else if (
          !full &&
          !details &&
          stored.get(entry.id)?.sourceHash === entry.listHash
        ) {
          c.skipped++
        } else todo.push(entry)
      }
      if (ignoredCount) log(`${kind}: ignored ${ignoredCount} non-playable`)
      await pool(todo, (entry) =>
        syncEntity(kind, c, entry, get, upsert, stored.get(entry.id)),
      )
    }

    async function syncMaterials() {
      const c = counts.materials
      let listed: Awaited<ReturnType<GameDataSource['listMaterials']>>
      try {
        listed = await source.listMaterials()
      } catch (e) {
        listFailed = true
        failures.push({ entity: 'material list', id: '*', reason: msg(e) })
        log(`material list failed: ${msg(e)}`)
        return
      }
      for (const s of listed.skipped) fail(c, 'material', s.id, s.reason)
      const stored = new Map(
        (
          await db
            .select({ id: materials.id, sourceHash: materials.sourceHash })
            .from(materials)
        ).map((r) => [r.id, r.sourceHash]),
      )
      const todo = listed.records.filter((r) => {
        const unchanged =
          !full && stored.get(r.id) === sha256(stableStringify(r))
        if (unchanged) c.skipped++
        return !unchanged
      })
      await pool(todo, async (rec) => {
        try {
          await upsertMaterial(db, rec, '')
          await syncMedia(
            mediaDeps,
            { type: 'material', id: rec.id },
            rec.media,
            { force: full },
          )
          await setSourceHash(
            db,
            'material',
            rec.id,
            sha256(stableStringify(rec)),
          )
          c.upserted++
        } catch (e) {
          fail(c, 'material', rec.id, msg(e))
        }
      })
    }

    let fatal: string | null = null
    try {
      // Categories are independent: one failing list doesn't stop the others.
      await syncList(
        'character',
        counts.characters,
        characters,
        () => source.listCharacters(),
        (id) => source.getCharacter(id),
        (r, h) => upsertCharacter(db, r, h),
        IGNORED_CHARACTER_IDS,
      )
      await syncList(
        'weapon',
        counts.weapons,
        weapons,
        () => source.listWeapons(),
        (id) => source.getWeapon(id),
        (r, h) => upsertWeapon(db, r, h),
      )
      await syncMaterials()
    } catch (e) {
      fatal = msg(e)
      listFailed = true
    }

    const anyFailed = failures.length > 0
    const status: SyncResult['status'] = listFailed
      ? 'failed'
      : anyFailed
        ? 'partial'
        : 'succeeded'
    const error =
      fatal ??
      (failures[0]
        ? `${failures[0].entity} ${failures[0].id}: ${failures[0].reason}`
        : null)
    await db
      .update(syncRuns)
      .set({ status, counts, error, finishedAt: new Date() })
      .where(eq(syncRuns.id, runId))
    log(`sync ${status}`)
    return { runId, status, counts, failures }
  }
}
