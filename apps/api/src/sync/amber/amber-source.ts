import { createHash } from 'node:crypto'
import {
  LOCALES,
  type Locale,
  normalizeElement,
  normalizeRarity,
  normalizeWeaponType,
  toAmberLang,
} from '@gi/shared'
import type { z } from 'zod'
import {
  type CharacterRecord,
  type GameDataSource,
  type ListEntry,
  type MaterialRecord,
  type MediaRef,
  type SkillIcon,
  SourceEntityError,
  type WeaponRecord,
} from '../source'
import { createHttp, UpstreamError } from './http'
import {
  avatarDetailResponse,
  avatarListResponse,
  materialListItem,
  materialListResponse,
  weaponDetailResponse,
  weaponListResponse,
} from './schemas'

export type AmberSourceOptions = {
  fetch?: typeof fetch
  baseUrl?: string
  concurrency?: number
  timeoutMs?: number
  retries?: number
  /** base backoff delay; doubles per retry */
  retryDelayMs?: number
}

const ASSET_BASE = 'https://gi.yatta.moe/assets/UI'
const asset = (name: string) => `${ASSET_BASE}/${name}.png`

/** unique talent then constellation icon names, in upstream order */
function skillIconsOf(d: {
  talent?: Record<string, unknown> | null
  constellation?: Record<string, unknown> | null
}): SkillIcon[] {
  const names = new Set<string>()
  for (const entry of [
    ...Object.values(d.talent ?? {}),
    ...Object.values(d.constellation ?? {}),
  ]) {
    const icon = (entry as { icon?: unknown } | null)?.icon
    if (typeof icon === 'string' && icon) names.add(icon)
  }
  return [...names].map((name) => ({ name, url: asset(name) }))
}

/** upstream uses 105 for "5-star featured"; treat as 5 */
function rarityOf(raw: number, id: string) {
  const r = normalizeRarity(raw === 105 ? 5 : raw)
  if (r === null) throw new SourceEntityError(id, `unknown rarity ${raw}`)
  return r
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function createAmberSource(
  opts: AmberSourceOptions = {},
): GameDataSource {
  const http = createHttp({
    fetch: opts.fetch ?? fetch,
    baseUrl: opts.baseUrl ?? 'https://gi.yatta.moe/api/v2',
    concurrency: opts.concurrency ?? 4,
    timeoutMs: opts.timeoutMs ?? 15_000,
    retries: opts.retries ?? 2,
    retryDelayMs: opts.retryDelayMs ?? 500,
  })

  /** Fetch + validate one locale; null if upstream 404s. */
  async function fetchParsed<S extends z.ZodType>(
    locale: Locale,
    path: string,
    schema: S,
    entityId: string | null, // null = list endpoint: failures are upstream errors
  ): Promise<z.output<S> | null> {
    const raw = await http.getJson(`${toAmberLang(locale)}/${path}`)
    if (raw === null) return null
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const reason = `unexpected ${locale} response shape for ${path}: ${parsed.error.message}`
      if (entityId === null) throw new UpstreamError(path, null, reason)
      throw new SourceEntityError(entityId, reason)
    }
    return parsed.data
  }

  async function fetchAllLocales<S extends z.ZodType>(
    path: string,
    schema: S,
    entityId: string | null,
    /** locales whose list contains the entity: a 404 there is an error, not absence */
    listedIn?: (l: Locale) => boolean,
  ) {
    const results = await Promise.all(
      LOCALES.map(
        async (l) => [l, await fetchParsed(l, path, schema, entityId)] as const,
      ),
    )
    const out = new Map<Locale, z.output<S>>()
    for (const [l, r] of results) {
      if (r !== null) out.set(l, r)
      else if (entityId !== null && listedIn?.(l))
        throw new SourceEntityError(
          entityId,
          `${l} detail missing (404) although listed`,
        )
    }
    return out
  }

  function hashEntries(
    ids: string[],
    byLocale: Map<Locale, Record<string, unknown>>,
  ): ListEntry[] {
    return ids.map((id) => ({
      id,
      listHash: sha256(
        stableStringify(LOCALES.map((l) => byLocale.get(l)?.[id] ?? null)),
      ),
    }))
  }

  /**
   * All locale lists of one kind, fetched once per source instance. Any locale
   * missing (404) is an upstream error: silently treating it as "no
   * translations" would wipe that locale for every entity.
   */
  const listCache = new Map<string, Promise<Map<Locale, z.output<z.ZodType>>>>()
  function loadLists<S extends z.ZodType>(kind: string, schema: S) {
    let p = listCache.get(kind)
    if (!p) {
      p = (async () => {
        const byLocale = await fetchAllLocales(kind, schema, null)
        for (const l of LOCALES) {
          if (!byLocale.has(l))
            throw new UpstreamError(kind, 404, `${kind} list missing for ${l}`)
        }
        return byLocale
      })()
      p.catch(() => listCache.delete(kind)) // allow a retry after failure
      listCache.set(kind, p)
    }
    return p as Promise<Map<Locale, z.output<S>>>
  }

  async function listEntries<S extends z.ZodType>(
    kind: string,
    schema: S,
    items: (d: z.output<S>) => Record<string, unknown>,
  ): Promise<ListEntry[]> {
    const byLocale = await loadLists(kind, schema)
    const enItems = byLocale.get('en') as z.output<S>
    const ids = Object.keys(items(enItems))
    const itemMaps = new Map<Locale, Record<string, unknown>>()
    for (const [l, d] of byLocale) itemMaps.set(l, items(d))
    return hashEntries(ids, itemMaps)
  }

  /** locales whose (cached) list contains the id */
  async function listedLocales<S extends z.ZodType>(
    kind: string,
    schema: S,
    items: (d: z.output<S>) => Record<string, unknown>,
    id: string,
  ): Promise<(l: Locale) => boolean> {
    const byLocale = await loadLists(kind, schema)
    return (l) => {
      const d = byLocale.get(l)
      return d !== undefined && id in items(d)
    }
  }

  const avatarItems = (d: z.output<typeof avatarListResponse>) => d.data.items
  // weapon skins (isWeaponSkin) have no stats/affix and aren't real weapons
  const weaponItems = (d: z.output<typeof weaponListResponse>) =>
    Object.fromEntries(
      Object.entries(d.data.items).filter(([, w]) => !w.isWeaponSkin),
    )

  return {
    listCharacters: () =>
      listEntries('avatar', avatarListResponse, avatarItems),
    listWeapons: () => listEntries('weapon', weaponListResponse, weaponItems),

    async getCharacter(id): Promise<CharacterRecord> {
      const byLocale = await fetchAllLocales(
        `avatar/${id}`,
        avatarDetailResponse,
        id,
        await listedLocales('avatar', avatarListResponse, avatarItems, id),
      )
      const en = byLocale.get('en')?.data
      if (!en) throw new SourceEntityError(id, 'en detail missing')

      const rarity = rarityOf(en.rank, id)
      const weaponType = normalizeWeaponType(en.weaponType)
      if (!weaponType) {
        throw new SourceEntityError(id, `unknown weaponType ${en.weaponType}`)
      }
      const element = normalizeElement(en.element)
      if (element === null) {
        throw new SourceEntityError(id, `unmappable element ${en.element}`)
      }
      const [month, day] = en.birthday ?? []
      const birthday: [number, number] | null =
        month && day ? [month, day] : null

      const i18n: CharacterRecord['i18n'] = {}
      for (const [l, res] of byLocale) {
        i18n[l] = {
          name: res.data.name,
          title: res.data.fetter?.title ?? null,
          description: res.data.fetter?.detail ?? null,
          details: {
            talents: Object.values(res.data.talent ?? {}),
            constellations: Object.values(res.data.constellation ?? {}),
          },
        }
      }

      const suffix = en.icon.replace(/^UI_AvatarIcon_/, '')
      const media: MediaRef[] = [
        { kind: 'icon', url: asset(en.icon) },
        { kind: 'gacha_splash', url: asset(`UI_Gacha_AvatarImg_${suffix}`) },
      ]

      return {
        id,
        rarity,
        element,
        weaponType,
        skillIcons: skillIconsOf(en),
        region: en.region ?? null,
        birthday,
        releaseAt: en.release ? new Date(en.release * 1000) : null,
        i18n,
        media,
      }
    },

    async getWeapon(id): Promise<WeaponRecord> {
      const byLocale = await fetchAllLocales(
        `weapon/${id}`,
        weaponDetailResponse,
        id,
        await listedLocales('weapon', weaponListResponse, weaponItems, id),
      )
      const en = byLocale.get('en')?.data
      if (!en) throw new SourceEntityError(id, 'en detail missing')
      const rarity = rarityOf(en.rank, id)
      const weaponType = normalizeWeaponType(en.type)
      if (!weaponType) {
        throw new SourceEntityError(id, `unknown weapon type ${en.type}`)
      }

      const i18n: WeaponRecord['i18n'] = {}
      for (const [l, res] of byLocale) {
        i18n[l] = {
          name: res.data.name,
          description: res.data.description ?? null,
          details: { affix: res.data.affix ?? null },
        }
      }
      const gacha = en.icon.replace(/^UI_EquipIcon_/, 'UI_Gacha_EquipIcon_')
      return {
        id,
        rarity,
        weaponType,
        i18n,
        media: [
          { kind: 'icon', url: asset(en.icon) },
          { kind: 'gacha_icon', url: asset(gacha) },
        ],
      }
    },

    async listMaterials() {
      const byLocale = await loadLists('material', materialListResponse)
      const en = byLocale.get('en')?.data.items as Record<string, unknown>
      const records: MaterialRecord[] = []
      const skipped: { id: string; reason: string }[] = []
      for (const [key, raw] of Object.entries(en)) {
        const item = materialListItem.safeParse(raw)
        if (!item.success) {
          skipped.push({
            id: key,
            reason: `invalid item: ${item.error.message}`,
          })
          continue
        }
        const it = item.data
        const id = String(it.id)
        const rarity = normalizeRarity(it.rank === 105 ? 5 : it.rank)
        if (rarity === null) {
          skipped.push({ id, reason: `unknown rarity ${it.rank}` })
          continue
        }
        const i18n: MaterialRecord['i18n'] = {}
        for (const [l, res] of byLocale) {
          const loc = materialListItem.safeParse(res.data.items[key])
          if (loc.success) i18n[l] = { name: loc.data.name, description: null }
        }
        records.push({
          id,
          rarity,
          category: it.type,
          i18n,
          media: [{ kind: 'icon', url: asset(it.icon) }],
        })
      }
      return { records, skipped }
    },
  }
}
