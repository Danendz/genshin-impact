import {
  ELEMENTS,
  type Element,
  isLocale,
  type Locale,
  WEAPON_TYPES,
  type WeaponType,
} from '@gi/shared'

/** left menu sections, in legacy order */
export const SECTIONS = [
  'attributes',
  'weapon',
  'artifacts',
  'constellation',
  'talents',
  'profile',
] as const
export type Section = (typeof SECTIONS)[number]

/** regions in game order; the filter lists the ones the roster has */
export const REGIONS = [
  'MONDSTADT',
  'LIYUE',
  'INAZUMA',
  'SUMERU',
  'FONTAINE',
  'NATLAN',
  'NODKRAI',
  'SNEZHNAYA',
  'TEYVAT',
] as const
export type Region = (typeof REGIONS)[number]

/** upstream codes that belong to a nation under another name */
const REGION_ALIASES: Record<string, Region> = {
  FATUI: 'SNEZHNAYA',
  SNEZHNAYA_STAR: 'SNEZHNAYA',
  NODKRAI_ZIBAI: 'NODKRAI',
}

/** folds an upstream region code into a nation; the rest is legacy's Teyvat */
export function regionGroup(raw: string | null): Region {
  if (!raw) return 'TEYVAT'
  const alias = REGION_ALIASES[raw]
  if (alias) return alias
  return (REGIONS as readonly string[]).includes(raw)
    ? (raw as Region)
    : 'TEYVAT'
}

/** filters hold several values each (legacy multi-select); the URL joins them with commas */
export type CharacterSearch = {
  element?: Element[]
  weaponType?: WeaponType[]
  rarity?: (4 | 5)[]
  region?: Region[]
  section?: Section
  locale?: Locale
}
export type FilterKey = 'element' | 'weaponType' | 'rarity' | 'region'
export const FILTER_KEYS = [
  'element',
  'weaponType',
  'rarity',
  'region',
] as const satisfies readonly FilterKey[]

const oneOf = <T extends string>(list: readonly T[], v: unknown) =>
  list.includes(v as T) ? (v as T) : undefined

/** a URL value: 'a,b', a lone number the router already parsed, or an array */
const values = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
    .map((v) => String(v).trim())
    .filter(Boolean)

const many = <T>(raw: unknown, keep: (v: string) => T | undefined) => {
  const out = [...new Set(values(raw).map(keep))].filter(
    (v): v is T => v !== undefined,
  )
  return out.length ? out : undefined
}

/** route search validator: invalid values are dropped, never thrown */
export function characterSearch(raw: Record<string, unknown>): CharacterSearch {
  const out: CharacterSearch = {}
  const element = many(raw.element, (v) => oneOf(ELEMENTS, v))
  const weaponType = many(raw.weaponType, (v) => oneOf(WEAPON_TYPES, v))
  const rarity = many(raw.rarity, (v) =>
    v === '4' || v === '5' ? (Number(v) as 4 | 5) : undefined,
  )
  // folded like the list, so links with old upstream codes still match
  const region = many(raw.region, (v) =>
    /^[A-Z_]+$/.test(v) ? regionGroup(v) : undefined,
  )
  if (element) out.element = element
  if (weaponType) out.weaponType = weaponType
  if (rarity) out.rarity = rarity
  if (region) out.region = region
  const section = oneOf(SECTIONS, raw.section)
  if (section) out.section = section
  if (isLocale(raw.locale)) out.locale = raw.locale
  return out
}

type Filterable = {
  element: string | null
  weaponType: string
  rarity: number
  region: string | null
}

/** any chosen value within a filter, every filter that has values */
export function filterCharacters<T extends Filterable>(
  items: T[],
  s: CharacterSearch,
): T[] {
  return items.filter((c) =>
    FILTER_KEYS.every((k) => {
      const chosen = s[k] as readonly (string | number)[] | undefined
      return !chosen || chosen.includes(c[k] as string | number)
    }),
  )
}

/** regions the roster has, in game order */
export function regionsOf(items: { region: string | null }[]): string[] {
  const have = new Set(items.map((c) => regionGroup(c.region)))
  return REGIONS.filter((r) => have.has(r))
}

export type TalentLevel = {
  level: number
  params: number[]
  description: string[]
}
export type Talent = {
  name: string
  icon: string
  type: number
  description: string
  promote: Record<string, TalentLevel>
}
export type Constellation = { name: string; icon: string; description: string }

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
const str = (x: unknown) => (typeof x === 'string' ? x : '')

function parsePromote(raw: unknown): Record<string, TalentLevel> {
  const out: Record<string, TalentLevel> = {}
  if (!isObj(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!isObj(v) || !Array.isArray(v.params) || !Array.isArray(v.description))
      continue
    out[k] = {
      level: typeof v.level === 'number' ? v.level : Number(k),
      params: v.params.filter((p): p is number => typeof p === 'number'),
      description: v.description.map(str),
    }
  }
  return out
}

/** narrows Amber talent/constellation JSON; malformed entries are dropped */
export function parseCharacterDetails(details: unknown): {
  talents: Talent[]
  constellations: Constellation[]
} {
  const d = isObj(details) ? details : {}
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(isObj) : [])
  return {
    talents: list(d.talents)
      .filter((t) => str(t.name))
      .map((t) => ({
        name: str(t.name),
        icon: str(t.icon),
        type: typeof t.type === 'number' ? t.type : -1,
        description: str(t.description),
        promote: parsePromote(t.promote),
      })),
    constellations: list(d.constellations)
      .filter((c) => str(c.name))
      .map((c) => ({
        name: str(c.name),
        icon: str(c.icon),
        description: str(c.description),
      })),
  }
}

export type TalentKind = 'normal' | 'skill' | 'burst' | 'passive'

/** Amber's type is 0 for both normal attack and skill, so use the icon prefix */
export function talentKind(
  t: Pick<Talent, 'icon' | 'type'>,
): TalentKind | null {
  if (t.icon.startsWith('Skill_A_')) return 'normal'
  if (t.icon.startsWith('Skill_S_')) return 'skill'
  if (t.icon.startsWith('Skill_E_')) return 'burst'
  if (t.type === 2) return 'passive'
  return null
}
