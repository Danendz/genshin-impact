import {
  characterI18n,
  characters,
  type Db,
  materialI18n,
  materials,
  weaponI18n,
  weapons,
} from '@gi/db'
import { eq } from 'drizzle-orm'
import type { CharacterRecord, MaterialRecord, WeaponRecord } from './source'

type Entries<T> = [string, NonNullable<T>][]
const entries = <T extends object>(o: T) =>
  Object.entries(o).filter(([, v]) => v != null) as Entries<T[keyof T]>

export async function upsertCharacter(
  db: Db,
  r: CharacterRecord,
  sourceHash: string,
): Promise<void> {
  const values = {
    rarity: r.rarity,
    element: r.element,
    weaponType: r.weaponType,
    region: r.region,
    birthdayMonth: r.birthday?.[0] ?? null,
    birthdayDay: r.birthday?.[1] ?? null,
    releaseAt: r.releaseAt,
    sourceHash,
    updatedAt: new Date(),
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(characters)
      .values({ id: r.id, ...values })
      .onConflictDoUpdate({ target: characters.id, set: values })
    await tx.delete(characterI18n).where(eq(characterI18n.characterId, r.id))
    const rows = entries(r.i18n).map(([locale, v]) => ({
      characterId: r.id,
      locale: locale as CharacterI18nLocale,
      name: v.name,
      title: v.title,
      description: v.description,
      details: v.details,
    }))
    if (rows.length) await tx.insert(characterI18n).values(rows)
  })
}

type CharacterI18nLocale = (typeof characterI18n.$inferInsert)['locale']

export async function upsertWeapon(
  db: Db,
  r: WeaponRecord,
  sourceHash: string,
): Promise<void> {
  const values = {
    rarity: r.rarity,
    weaponType: r.weaponType,
    sourceHash,
    updatedAt: new Date(),
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(weapons)
      .values({ id: r.id, ...values })
      .onConflictDoUpdate({ target: weapons.id, set: values })
    await tx.delete(weaponI18n).where(eq(weaponI18n.weaponId, r.id))
    const rows = entries(r.i18n).map(([locale, v]) => ({
      weaponId: r.id,
      locale: locale as CharacterI18nLocale,
      name: v.name,
      description: v.description,
      details: v.details,
    }))
    if (rows.length) await tx.insert(weaponI18n).values(rows)
  })
}

export async function upsertMaterial(
  db: Db,
  r: MaterialRecord,
  sourceHash: string,
): Promise<void> {
  const values = {
    rarity: r.rarity,
    category: r.category,
    sourceHash,
    updatedAt: new Date(),
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(materials)
      .values({ id: r.id, ...values })
      .onConflictDoUpdate({ target: materials.id, set: values })
    await tx.delete(materialI18n).where(eq(materialI18n.materialId, r.id))
    const rows = entries(r.i18n).map(([locale, v]) => ({
      materialId: r.id,
      locale: locale as CharacterI18nLocale,
      name: v.name,
      description: v.description,
    }))
    if (rows.length) await tx.insert(materialI18n).values(rows)
  })
}

export async function setSourceHash(
  db: Db,
  table: 'character' | 'weapon' | 'material',
  id: string,
  hash: string,
): Promise<void> {
  const t =
    table === 'character'
      ? characters
      : table === 'weapon'
        ? weapons
        : materials
  await db.update(t).set({ sourceHash: hash }).where(eq(t.id, id))
}
