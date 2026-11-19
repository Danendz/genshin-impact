export const ELEMENTS = [
  'pyro',
  'hydro',
  'anemo',
  'electro',
  'dendro',
  'cryo',
  'geo',
] as const
export type Element = (typeof ELEMENTS)[number]

export const WEAPON_TYPES = [
  'sword',
  'claymore',
  'polearm',
  'bow',
  'catalyst',
] as const
export type WeaponType = (typeof WEAPON_TYPES)[number]

export type Rarity = 1 | 2 | 3 | 4 | 5
