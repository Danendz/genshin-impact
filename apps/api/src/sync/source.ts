import type { Element, Locale, Rarity, WeaponType } from '@gi/shared'

export type MediaKind = 'icon' | 'gacha_splash' | 'gacha_icon'
export type MediaRef = { kind: MediaKind; url: string }

/** hash of the list item across all locales; changes when any locale's item changes */
export type ListEntry = { id: string; listHash: string }

export type CharacterRecord = {
  id: string
  rarity: Rarity
  element: Element | null
  weaponType: WeaponType
  region: string | null
  birthday: [month: number, day: number] | null
  releaseAt: Date | null
  i18n: Partial<
    Record<
      Locale,
      {
        name: string
        title: string | null
        description: string | null
        details: { talents: unknown[]; constellations: unknown[] }
      }
    >
  >
  media: MediaRef[]
}

export type WeaponRecord = {
  id: string
  rarity: Rarity
  weaponType: WeaponType
  i18n: Partial<
    Record<
      Locale,
      { name: string; description: string | null; details: { affix: unknown } }
    >
  >
  media: MediaRef[]
}

export type MaterialRecord = {
  id: string
  rarity: Rarity
  category: string
  i18n: Partial<Record<Locale, { name: string; description: null }>>
  media: MediaRef[]
}

export class SourceEntityError extends Error {
  constructor(
    public entityId: string,
    reason: string,
  ) {
    super(`${entityId}: ${reason}`)
    this.name = 'SourceEntityError'
  }
}

export interface GameDataSource {
  listCharacters(): Promise<ListEntry[]>
  /** throws SourceEntityError on unmappable data */
  getCharacter(id: string): Promise<CharacterRecord>
  listWeapons(): Promise<ListEntry[]>
  getWeapon(id: string): Promise<WeaponRecord>
  /** materials come from the list only (no per-item detail) */
  listMaterials(): Promise<{
    records: MaterialRecord[]
    skipped: { id: string; reason: string }[]
  }>
}
