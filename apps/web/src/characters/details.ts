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

export type CharacterSearch = {
  element?: Element
  weaponType?: WeaponType
  rarity?: 4 | 5
  section?: Section
  locale?: Locale
}

const oneOf = <T extends string>(list: readonly T[], v: unknown) =>
  list.includes(v as T) ? (v as T) : undefined

/** route search validator: invalid values are dropped, never thrown */
export function characterSearch(raw: Record<string, unknown>): CharacterSearch {
  const rarity = Number(raw.rarity)
  const out: CharacterSearch = {}
  const element = oneOf(ELEMENTS, raw.element)
  const weaponType = oneOf(WEAPON_TYPES, raw.weaponType)
  if (element) out.element = element
  if (weaponType) out.weaponType = weaponType
  if (rarity === 4 || rarity === 5) out.rarity = rarity
  const section = oneOf(SECTIONS, raw.section)
  if (section) out.section = section
  if (isLocale(raw.locale)) out.locale = raw.locale
  return out
}

export function filterCharacters<
  T extends { element: string | null; weaponType: string; rarity: number },
>(items: T[], s: CharacterSearch): T[] {
  return items.filter(
    (c) =>
      (!s.element || c.element === s.element) &&
      (!s.weaponType || c.weaponType === s.weaponType) &&
      (!s.rarity || c.rarity === s.rarity),
  )
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
