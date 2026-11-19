import { ELEMENTS, LOCALES, WEAPON_TYPES } from '@gi/shared'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const elementEnum = pgEnum('element', ELEMENTS)
export const weaponTypeEnum = pgEnum('weapon_type', WEAPON_TYPES)
export const localeEnum = pgEnum('locale', LOCALES)
export const mediaOwnerTypeEnum = pgEnum('media_owner_type', [
  'character',
  'weapon',
  'material',
])
export const mediaKindEnum = pgEnum('media_kind', [
  'icon',
  'gacha_splash',
  'gacha_icon',
  'model_glb',
])
export const syncStatusEnum = pgEnum('sync_status', [
  'running',
  'succeeded',
  'partial',
  'failed',
])

const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const characters = pgTable('characters', {
  id: text().primaryKey(),
  rarity: smallint().notNull(),
  element: elementEnum(),
  weaponType: weaponTypeEnum().notNull(),
  region: text(),
  birthdayMonth: smallint(),
  birthdayDay: smallint(),
  releaseAt: timestamp({ withTimezone: true }),
  sourceHash: text().notNull(),
  updatedAt: updatedAt(),
})

export const characterI18n = pgTable(
  'character_i18n',
  {
    characterId: text()
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    title: text(),
    description: text(),
    details: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.locale] })],
)

export const weapons = pgTable('weapons', {
  id: text().primaryKey(),
  rarity: smallint().notNull(),
  weaponType: weaponTypeEnum().notNull(),
  sourceHash: text().notNull(),
  updatedAt: updatedAt(),
})

export const weaponI18n = pgTable(
  'weapon_i18n',
  {
    weaponId: text()
      .notNull()
      .references(() => weapons.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    description: text(),
    details: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.weaponId, t.locale] })],
)

export const materials = pgTable('materials', {
  id: text().primaryKey(),
  rarity: smallint().notNull(),
  category: text().notNull(),
  sourceHash: text().notNull(),
  updatedAt: updatedAt(),
})

export const materialI18n = pgTable(
  'material_i18n',
  {
    materialId: text()
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    description: text(),
  },
  (t) => [primaryKey({ columns: [t.materialId, t.locale] })],
)

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: serial().primaryKey(),
    ownerType: mediaOwnerTypeEnum().notNull(),
    ownerId: text().notNull(),
    kind: mediaKindEnum().notNull(),
    sourceUrl: text().notNull(),
    r2Key: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    contentHash: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.ownerType, t.ownerId, t.kind)],
)

export const syncRuns = pgTable('sync_runs', {
  id: serial().primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
  status: syncStatusEnum().notNull(),
  counts: jsonb().notNull(),
  error: text(),
})

export const siteAssets = pgTable(
  'site_assets',
  {
    id: serial().primaryKey(),
    group: text().notNull(),
    r2Key: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    contentHash: text().notNull().unique(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.group, t.sortOrder)],
)
