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
  SourceEntityError,
  type WeaponRecord,
} from '../source'
import { createHttp } from './http'
import {
  avatarDetailResponse,
  avatarListResponse,
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
    entityId: string,
  ): Promise<z.output<S> | null> {
    const raw = await http.getJson(`${toAmberLang(locale)}/${path}`)
    if (raw === null) return null
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      throw new SourceEntityError(
        entityId,
        `unexpected ${locale} response shape for ${path}: ${parsed.error.message}`,
      )
    }
    return parsed.data
  }

  async function fetchAllLocales<S extends z.ZodType>(
    path: string,
    schema: S,
    entityId: string,
  ) {
    const results = await Promise.all(
      LOCALES.map(
        async (l) => [l, await fetchParsed(l, path, schema, entityId)] as const,
      ),
    )
    const out = new Map<Locale, z.output<S>>()
    for (const [l, r] of results) if (r !== null) out.set(l, r)
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

  async function listEntries<S extends z.ZodType>(
    kind: string,
    schema: S,
    items: (d: z.output<S>) => Record<string, unknown>,
  ): Promise<ListEntry[]> {
    const byLocale = await fetchAllLocales(kind, schema, kind)
    const enItems = byLocale.get('en')
    if (!enItems)
      throw new SourceEntityError(kind, `${kind} list missing for en`)
    const ids = Object.keys(items(enItems))
    const itemMaps = new Map<Locale, Record<string, unknown>>()
    for (const [l, d] of byLocale) itemMaps.set(l, items(d))
    return hashEntries(ids, itemMaps)
  }

  return {
    listCharacters: () =>
      listEntries('avatar', avatarListResponse, (d) => d.data.items),
    listWeapons: () =>
      listEntries('weapon', weaponListResponse, (d) => d.data.items),

    async getCharacter(id): Promise<CharacterRecord> {
      const byLocale = await fetchAllLocales(
        `avatar/${id}`,
        avatarDetailResponse,
        id,
      )
      const en = byLocale.get('en')?.data
      if (!en) throw new SourceEntityError(id, 'en detail missing')

      const rarity = rarityOf(en.rank, id)
      const weaponType = normalizeWeaponType(en.weaponType)
      if (!weaponType) {
        throw new SourceEntityError(id, `unknown weaponType ${en.weaponType}`)
      }
      // Traveler has no element in some forms (null); anything else must map.
      const element = normalizeElement(en.element)
      if (en.element != null && element === null) {
        throw new SourceEntityError(id, `unknown element ${en.element}`)
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

    async listMaterials(): Promise<MaterialRecord[]> {
      const byLocale = await fetchAllLocales(
        'material',
        materialListResponse,
        'material',
      )
      const en = byLocale.get('en')?.data.items
      if (!en) throw new SourceEntityError('material', 'en list missing')
      const out: MaterialRecord[] = []
      for (const [key, item] of Object.entries(en)) {
        const id = String(item.id ?? key)
        const i18n: MaterialRecord['i18n'] = {}
        for (const [l, res] of byLocale) {
          const it = res.data.items[key]
          if (it) i18n[l] = { name: it.name, description: null }
        }
        out.push({
          id,
          rarity: rarityOf(item.rank, id),
          category: item.type,
          i18n,
          media: [{ kind: 'icon', url: asset(item.icon) }],
        })
      }
      return out
    },
  }
}
