import type { Element, Rarity, WeaponType } from './enums'

const ELEMENT_MAP: Record<string, Element> = {
  Fire: 'pyro',
  Water: 'hydro',
  Wind: 'anemo',
  Electric: 'electro',
  Grass: 'dendro',
  Ice: 'cryo',
  Rock: 'geo',
}

const WEAPON_MAP: Record<string, WeaponType> = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_BOW: 'bow',
  WEAPON_CATALYST: 'catalyst',
  // detail responses use display labels instead of WEAPON_* codes
  Sword: 'sword',
  Claymore: 'claymore',
  Polearm: 'polearm',
  Bow: 'bow',
  Catalyst: 'catalyst',
}

export function normalizeElement(
  raw: string | null | undefined,
): Element | null {
  if (raw == null) return null
  return Object.hasOwn(ELEMENT_MAP, raw) ? (ELEMENT_MAP[raw] ?? null) : null
}

export function normalizeWeaponType(raw: string): WeaponType | null {
  return Object.hasOwn(WEAPON_MAP, raw) ? (WEAPON_MAP[raw] ?? null) : null
}

export function normalizeRarity(raw: number): Rarity | null {
  return raw === 1 || raw === 2 || raw === 3 || raw === 4 || raw === 5
    ? raw
    : null
}
