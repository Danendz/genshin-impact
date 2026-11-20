import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { characterI18n, characters, createDb, mediaAssets } from './index'
import { resetDb } from './test-utils'

const { db, close } = createDb(inject('dbUrl'))

const character = {
  id: '10000005-pyro',
  rarity: 5,
  element: 'pyro',
  weaponType: 'sword',
  sourceHash: 'h',
} as const

beforeEach(() => resetDb(db))
afterAll(() => close())

describe('schema', () => {
  it('joins character with its en and ru i18n rows', async () => {
    await db.insert(characters).values(character)
    await db.insert(characterI18n).values([
      { characterId: character.id, locale: 'en', name: 'Diluc', details: {} },
      { characterId: character.id, locale: 'ru', name: 'Дилюк', details: {} },
    ])
    const rows = await db
      .select({ locale: characterI18n.locale, name: characterI18n.name })
      .from(characters)
      .innerJoin(characterI18n, eq(characterI18n.characterId, characters.id))
      .orderBy(characterI18n.locale)
    expect(rows).toEqual([
      { locale: 'en', name: 'Diluc' },
      { locale: 'ru', name: 'Дилюк' },
    ])
  })

  it('rejects duplicate (characterId, locale)', async () => {
    await db.insert(characters).values(character)
    const row = {
      characterId: character.id,
      locale: 'en',
      name: 'A',
      details: {},
    } as const
    await db.insert(characterI18n).values(row)
    await expect(db.insert(characterI18n).values(row)).rejects.toThrow()
  })

  it('cascades i18n deletion with the character', async () => {
    await db.insert(characters).values(character)
    await db.insert(characterI18n).values({
      characterId: character.id,
      locale: 'en',
      name: 'A',
      details: {},
    })
    await db.delete(characters).where(eq(characters.id, character.id))
    expect(await db.select().from(characterI18n)).toHaveLength(0)
  })

  it('rejects duplicate media (ownerType, ownerId, kind)', async () => {
    const media = {
      ownerType: 'character',
      ownerId: character.id,
      kind: 'icon',
      sourceUrl: 'http://x/a.png',
      r2Key: 'a',
      width: 1,
      height: 1,
      contentHash: 'c',
    } as const
    await db.insert(mediaAssets).values(media)
    await expect(
      db.insert(mediaAssets).values({ ...media, r2Key: 'b' }),
    ).rejects.toThrow()
  })

  it('accepts skill_icon media owned by icon name', async () => {
    await db.insert(mediaAssets).values({
      ownerType: 'skill_icon',
      ownerId: 'Skill_A_01',
      kind: 'icon',
      sourceUrl: 'http://x/Skill_A_01.png',
      r2Key: 'skill_icon/Skill_A_01/icon.webp',
      width: 1,
      height: 1,
      contentHash: 'c',
    })
    expect(await db.select().from(mediaAssets)).toHaveLength(1)
  })
})
